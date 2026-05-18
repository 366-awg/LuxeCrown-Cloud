const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const mpesa = require('../services/mpesa.service');


router.post('/mpesa/callback', asyncHandler(async (req, res) => {
  // Respond to Safaricom immediately (they retry if no 200 within 5s)
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  // Process asynchronously
  try {
    const body = req.body instanceof Buffer ? req.body.toString('utf8') : req.body;
    await mpesa.handleCallback(body);
  } catch (err) {
    console.error('[M-Pesa Callback] Error:', err.message);
  }
}));


router.post('/mpesa/retry', authenticate, asyncHandler(async (req, res) => {
  const { booking_id, phone } = req.body;
  if (!booking_id || !phone) {
    return res.status(400).json({ error: 'booking_id and phone are required.' });
  }

  // Fetch booking
  const bkResult = await query(
    'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
    [booking_id, req.user.id]
  );
  if (!bkResult.rows.length) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const booking = bkResult.rows[0];
  if (booking.status === 'confirmed') {
    return res.status(400).json({ error: 'This booking is already confirmed and paid.' });
  }
  if (booking.status === 'cancelled') {
    return res.status(400).json({ error: 'Booking has been cancelled. Please make a new booking.' });
  }

  // Cancel any previous pending transactions
  await query(
    `UPDATE transactions SET status = 'cancelled'
     WHERE booking_id = $1 AND status = 'pending'`,
    [booking_id]
  );

  // Initiate new STK Push
  const stkResult = await mpesa.initiateSTKPush({
    phone,
    amount:      booking.service_price,
    bookingId:   booking.id,
    userId:      req.user.id,
    description: `LuxeCrown-Studio - ${booking.service_name}`,
  });

  res.json({
    message: `M-Pesa prompt sent to ${phone}. Enter your PIN to confirm.`,
    checkoutRequestId: stkResult.checkoutRequestId,
  });
}));


router.get('/mpesa/status/:checkoutRequestId', authenticate, asyncHandler(async (req, res) => {
  const { checkoutRequestId } = req.params;

  const result = await query(
    `SELECT t.*, b.status as booking_status
     FROM transactions t
     LEFT JOIN bookings b ON b.id = t.booking_id
     WHERE t.mpesa_checkout_id = $1`,
    [checkoutRequestId]
  );

  if (!result.rows.length) {
    return res.status(404).json({ error: 'Transaction not found.' });
  }

  const txn = result.rows[0];

  // If still pending after 30s, query Daraja directly
  if (txn.status === 'pending') {
    try {
      const darajaStatus = await mpesa.querySTKStatus(checkoutRequestId);
      if (darajaStatus.ResultCode === '0') {
        // Payment succeeded but callback was delayed — update manually
        await query(
          `UPDATE transactions SET status = 'completed', result_code = 0 WHERE mpesa_checkout_id = $1`,
          [checkoutRequestId]
        );
        txn.status = 'completed';
      } else if (darajaStatus.ResultCode) {
        await query(
          `UPDATE transactions SET status = 'failed', result_code = $1, result_desc = $2 WHERE mpesa_checkout_id = $3`,
          [darajaStatus.ResultCode, darajaStatus.ResultDesc, checkoutRequestId]
        );
        txn.status = 'failed';
      }
    } catch (_) { /* Daraja query may fail if still genuinely pending */ }
  }

  res.json({
    status:          txn.status,
    booking_status:  txn.booking_status,
    mpesa_receipt:   txn.mpesa_receipt,
    amount:          txn.amount,
    result_desc:     txn.result_desc,
  });
}));


router.get('/transactions', authenticate, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { status, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT t.*, b.service_name, b.booking_date, b.booking_time,
           u.name as customer_name, u.email as customer_email
    FROM transactions t
    LEFT JOIN bookings b ON b.id = t.booking_id
    LEFT JOIN users u ON u.id = t.user_id
  `;
  const params = [];
  const conditions = [];

  if (!isAdmin) conditions.push(`t.user_id = $${params.push(req.user.id)}`);
  if (status)   conditions.push(`t.status = $${params.push(status)}`);

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` ORDER BY t.created_at DESC LIMIT $${params.push(parseInt(limit))} OFFSET $${params.push(parseInt(offset))}`;

  const result = await query(sql, params);

  // Revenue summary for admin
  let summary = null;
  if (isAdmin) {
    const rev = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status='completed') as total_count,
         COALESCE(SUM(amount) FILTER (WHERE status='completed'),0) as total_revenue,
         COUNT(*) FILTER (WHERE status='pending') as pending_count,
         COUNT(*) FILTER (WHERE status='failed') as failed_count
       FROM transactions`
    );
    summary = rev.rows[0];
  }

  res.json({ transactions: result.rows, summary });
}));

module.exports = router;

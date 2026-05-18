const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const mpesa = require('../services/mpesa.service');


router.get('/', authenticate, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const { status, date, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT b.*, s.icon as service_icon,
      t.mpesa_receipt, t.status as pay_status
    FROM bookings b
    JOIN services s ON s.id = b.service_id
    LEFT JOIN transactions t ON t.booking_id = b.id AND t.status = 'completed'
  `;
  const params = [];
  const conditions = [];

  if (!isAdmin) {
    conditions.push(`b.user_id = $${params.push(req.user.id)}`);
  }
  if (status) {
    conditions.push(`b.status = $${params.push(status)}`);
  }
  if (date) {
    conditions.push(`b.booking_date = $${params.push(date)}`);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` ORDER BY b.created_at DESC LIMIT $${params.push(parseInt(limit))} OFFSET $${params.push(parseInt(offset))}`;

  const result = await query(sql, params);
  res.json({ bookings: result.rows, count: result.rowCount });
}));

// ============================================================
// GET /api/bookings/availability
// Check available slots for a date
// ============================================================
router.get('/availability', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required (YYYY-MM-DD).' });

  const ALL_SLOTS = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM'];

  const result = await query(
    `SELECT booking_time FROM bookings
     WHERE booking_date = $1 AND status NOT IN ('cancelled')`,
    [date]
  );

  const booked    = result.rows.map(r => r.booking_time);
  const available = ALL_SLOTS.filter(s => !booked.includes(s));

  res.json({ date, booked, available });
}));

// ============================================================
// GET /api/bookings/:id
// ============================================================
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT b.*, s.icon, t.mpesa_receipt, t.status as pay_status
     FROM bookings b
     JOIN services s ON s.id = b.service_id
     LEFT JOIN transactions t ON t.booking_id = b.id AND t.status = 'completed'
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Booking not found.' });
  const booking = result.rows[0];
  // Users can only see their own bookings
  if (req.user.role !== 'admin' && booking.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied.' });
  }
  res.json({ booking });
}));

// ============================================================
// POST /api/bookings
// Create booking + trigger STK Push
// ============================================================
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const {
    service_id, booking_date, booking_time,
    customer_name, customer_email, customer_phone, notes,
  } = req.body;

  if (!service_id || !booking_date || !booking_time || !customer_phone) {
    return res.status(400).json({ error: 'service_id, booking_date, booking_time and customer_phone are required.' });
  }

  // 1. Check slot availability
  const conflict = await query(
    `SELECT id FROM bookings
     WHERE booking_date = $1 AND booking_time = $2 AND status NOT IN ('cancelled')`,
    [booking_date, booking_time]
  );
  if (conflict.rows.length) {
    return res.status(409).json({ error: 'This time slot is already booked. Please choose another.' });
  }

  // 2. Validate service
  const svcResult = await query('SELECT * FROM services WHERE id = $1 AND is_active = TRUE', [service_id]);
  if (!svcResult.rows.length) return res.status(404).json({ error: 'Service not found or inactive.' });
  const service = svcResult.rows[0];

  // 3. Create booking (status = pending until payment confirmed)
  const bkResult = await query(
    `INSERT INTO bookings
      (user_id, service_id, service_name, service_price,
       customer_name, customer_email, customer_phone, booking_date, booking_time, notes, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')
     RETURNING *`,
    [
      req.user.id, service_id, service.name, service.price,
      customer_name || req.user.name,
      customer_email || req.user.email,
      customer_phone, booking_date, booking_time, notes || null,
    ]
  );
  const booking = bkResult.rows[0];

  // 4. Initiate M-Pesa STK Push
  let stkResult = null;
  try {
    stkResult = await mpesa.initiateSTKPush({
      phone:       customer_phone,
      amount:      service.price,
      bookingId:   booking.id,
      userId:      req.user.id,
      description: `LuxeCrown-Studio - ${service.name}`,
    });
  } catch (mpesaErr) {
    // Don't cancel the booking — let user retry payment
    console.error('[M-Pesa] STK Push error:', mpesaErr.message);
    return res.status(201).json({
      booking,
      payment: { error: mpesaErr.message, message: 'Booking created but payment initiation failed. Please retry.' },
    });
  }

  res.status(201).json({
    booking,
    payment: {
      checkoutRequestId: stkResult.checkoutRequestId,
      message: `M-Pesa STK Push sent to ${customer_phone}. Enter your PIN to confirm.`,
    },
  });
}));

// ============================================================
// PATCH /api/bookings/:id/status — admin only
// ============================================================
router.patch('/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending','confirmed','cancelled','completed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
  }

  const result = await query(
    'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Booking not found.' });

  res.json({ booking: result.rows[0], message: `Booking ${status}.` });
}));

// ============================================================
// DELETE /api/bookings/:id — admin or booking owner
// ============================================================
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `UPDATE bookings SET status = 'cancelled'
     WHERE id = $1 AND (user_id = $2 OR $3 = 'admin')
     RETURNING id`,
    [req.params.id, req.user.id, req.user.role]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Booking not found or access denied.' });
  res.json({ message: 'Booking cancelled.' });
}));

module.exports = router;

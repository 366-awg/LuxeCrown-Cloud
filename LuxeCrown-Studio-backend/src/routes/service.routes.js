
const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

// GET /api/services — public
router.get('/', asyncHandler(async (req, res) => {
  const { category } = req.query;
  const result = await query(
    `SELECT s.*, COALESCE(
       json_agg(si.url ORDER BY si.sort_order) FILTER (WHERE si.id IS NOT NULL), '[]'
     ) AS images
     FROM services s
     LEFT JOIN service_images si ON si.service_id = s.id
     WHERE s.is_active = TRUE ${category ? 'AND s.category = $1' : ''}
     GROUP BY s.id
     ORDER BY s.sort_order`,
    category ? [category] : []
  );
  res.json({ services: result.rows });
}));

// GET /api/services/:id — public
router.get('/:id', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT s.*,
       COALESCE(json_agg(json_build_object('id',si.id,'url',si.url,'alt_text',si.alt_text)
         ORDER BY si.sort_order) FILTER (WHERE si.id IS NOT NULL), '[]') AS images
     FROM services s
     LEFT JOIN service_images si ON si.service_id = s.id
     WHERE s.id = $1
     GROUP BY s.id`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Service not found.' });
  res.json({ service: result.rows[0] });
}));

// POST /api/services — admin only
router.post('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { name, category, icon, description, price, duration } = req.body;
  if (!name || !category || !description || !price || !duration) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  const result = await query(
    `INSERT INTO services (name, category, icon, description, price, duration)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [name, category, icon || '✂️', description, parseInt(price), duration]
  );
  res.status(201).json({ service: result.rows[0], message: 'Service created.' });
}));

// PUT /api/services/:id — admin only
router.put('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { name, category, icon, description, price, duration, is_active } = req.body;
  const result = await query(
    `UPDATE services SET name=$1, category=$2, icon=$3, description=$4,
     price=$5, duration=$6, is_active=$7
     WHERE id=$8 RETURNING *`,
    [name, category, icon, description, parseInt(price), duration, is_active ?? true, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Service not found.' });
  res.json({ service: result.rows[0], message: 'Service updated.' });
}));

// DELETE /api/services/:id — admin only
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const result = await query('DELETE FROM services WHERE id=$1 RETURNING id', [req.params.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Service not found.' });
  res.json({ message: 'Service deleted.' });
}));

module.exports = router;



/*
const express = require('express');
const router  = express.Router();
const { query, withTransaction } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const mpesa = require('../services/mpesa.service');

// GET /api/bookings — user sees own, admin sees all
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const result = isAdmin
    ? await query(`SELECT b.*, s.icon as service_icon FROM bookings b
                   JOIN services s ON s.id = b.service_id
                   ORDER BY b.created_at DESC`)
    : await query(`SELECT b.*, s.icon as service_icon FROM bookings b
                   JOIN services s ON s.id = b.service_id
                   WHERE b.user_id = $1 ORDER BY b.created_at DESC`, [req.user.id]);
  res.json({ bookings: result.rows });
}));

// GET /api/bookings/availability?date=2025-05-10
router.get('/availability', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date query param required.' });
  const ALL_SLOTS = ['9:00 AM','10:00 AM','11:00 AM','12:00 PM','1:00 PM','2:00 PM','3:00 PM'];
  const result = await query(
    `SELECT booking_time FROM bookings
     WHERE booking_date = $1 AND status NOT IN ('cancelled')`,
    [date]
  );
  const booked = result.rows.map(r => r.booking_time);
  const available = ALL_SLOTS.filter(s => !booked.includes(s));
  res.json({ date, booked, available });
}));

// POST /api/bookings — create + initiate M-Pesa STK Push
router.post('/', authenticate, asyncHandler(async (req, res) => {
  const { service_id, booking_date, booking_time, customer_name, customer_email, customer_phone, notes } = req.body;
  if (!service_id || !booking_date || !booking_time || !customer_phone) {
    return res.status(400).json({ error: 'service_id, date, time and phone are required.' });
  }
  // Check availability
  const conflict = await query(
    `SELECT id FROM bookings WHERE booking_date=$1 AND booking_time=$2 AND status NOT IN ('cancelled')`,
    [booking_date, booking_time]
  );
  if (conflict.rows.length) return res.status(409).json({ error: 'This slot is already booked. Please choose another time.' });

  const svc = await query('SELECT * FROM services WHERE id=$1 AND is_active=TRUE', [service_id]);
  if (!svc.rows.length) return res.status(404).json({ error: 'Service not found.' });
  const service = svc.rows[0];

  const booking = await query(
    `INSERT INTO bookings
      (user_id, service_id, service_name, service_price, customer_name, customer_email, customer_phone, booking_date, booking_time, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [req.user.id, service_id, service.name, service.price,
     customer_name || req.user.name, customer_email || req.user.email,
     customer_phone, booking_date, booking_time, notes || null]
  );
  const bk = booking.rows[0];

  // Initiate M-Pesa STK Push
  const stk = await mpesa.initiateSTKPush({
    phone: customer_phone, amount: service.price,
    bookingId: bk.id, userId: req.user.id,
    description: `LuxeCrown-Studio - ${service.name}`,
  });

  res.status(201).json({
    booking: bk,
    payment: { checkoutRequestId: stk.checkoutRequestId, message: 'STK Push sent. Enter your M-Pesa PIN.' },
  });
}));

// PATCH /api/bookings/:id/status — admin
router.patch('/:id/status', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { status } = req.body;
  const valid = ['pending','confirmed','cancelled','completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const result = await query(
    `UPDATE bookings SET status=$1 WHERE id=$2 RETURNING *`,
    [status, req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Booking not found.' });
  res.json({ booking: result.rows[0] });
}));

module.exports = router;
*/

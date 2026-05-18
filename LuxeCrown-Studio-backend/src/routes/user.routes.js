const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query } = require('../config/db');
const { authenticate, requireAdmin } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');


router.get('/profile', authenticate, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, email, phone, role, avatar_url, is_verified, created_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );
  res.json({ user: result.rows[0] });
}));


router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const result = await query(
    `UPDATE users SET name = $1, phone = $2
     WHERE id = $3
     RETURNING id, name, email, phone, role, avatar_url`,
    [name.trim(), phone || null, req.user.id]
  );
  res.json({ user: result.rows[0], message: 'Profile updated.' });
}));

router.put('/password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const result = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = result.rows[0];

  if (!user.password_hash) {
    return res.status(400).json({ error: 'Google sign-in accounts cannot set a password here.' });
  }

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(400).json({ error: 'Current password is incorrect.' });

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

  // Invalidate all other sessions
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [req.user.id]);

  res.json({ message: 'Password changed. Please log in again.' });
}));


router.get('/dashboard-stats', authenticate, asyncHandler(async (req, res) => {
  const [bookings, spent] = await Promise.all([
    query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
         COUNT(*) FILTER (WHERE status='pending') as pending,
         COUNT(*) FILTER (WHERE status='cancelled') as cancelled
       FROM bookings WHERE user_id = $1`,
      [req.user.id]
    ),
    query(
      `SELECT COALESCE(SUM(t.amount), 0) as total_spent
       FROM transactions t
       WHERE t.user_id = $1 AND t.status = 'completed'`,
      [req.user.id]
    ),
  ]);

  res.json({
    bookings:    bookings.rows[0],
    total_spent: spent.rows[0].total_spent,
  });
}));


router.get('/', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const { search, is_blocked, limit = 50, offset = 0 } = req.query;

  let sql = `
    SELECT u.id, u.name, u.email, u.phone, u.role, u.is_blocked,
           u.is_verified, u.avatar_url, u.created_at,
           COUNT(b.id) as booking_count,
           COALESCE(SUM(t.amount) FILTER (WHERE t.status='completed'), 0) as total_spent
    FROM users u
    LEFT JOIN bookings b ON b.user_id = u.id
    LEFT JOIN transactions t ON t.user_id = u.id
  `;
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push(
      `(u.name ILIKE $${params.push('%'+search+'%')} OR u.email ILIKE $${params.push('%'+search+'%')})`
    );
  }
  if (is_blocked !== undefined) {
    conditions.push(`u.is_blocked = $${params.push(is_blocked === 'true')}`);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ` GROUP BY u.id ORDER BY u.created_at DESC
           LIMIT $${params.push(parseInt(limit))} OFFSET $${params.push(parseInt(offset))}`;

  const result = await query(sql, params);
  res.json({ users: result.rows, count: result.rowCount });
}));

// GET /api/users/admin-stats — admin dashboard stats
router.get('/admin-stats', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const [users, bookings, revenue, topServices] = await Promise.all([
    query(`SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE is_blocked=FALSE AND role='user') as active,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
           FROM users`),
    query(`SELECT
             COUNT(*) as total,
             COUNT(*) FILTER (WHERE status='confirmed') as confirmed,
             COUNT(*) FILTER (WHERE status='pending') as pending,
             COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
             COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as this_month
           FROM bookings`),
    query(`SELECT
             COALESCE(SUM(amount) FILTER (WHERE status='completed'), 0) as total,
             COALESCE(SUM(amount) FILTER (WHERE status='completed'
               AND created_at > NOW() - INTERVAL '30 days'), 0) as this_month,
             COALESCE(SUM(amount) FILTER (WHERE status='completed'
               AND created_at > NOW() - INTERVAL '7 days'), 0) as this_week
           FROM transactions`),
    query(`SELECT b.service_name, COUNT(*) as count, SUM(b.service_price) as revenue
           FROM bookings b WHERE b.status != 'cancelled'
           GROUP BY b.service_name ORDER BY count DESC LIMIT 5`),
  ]);

  // Monthly revenue for chart (last 7 months)
  const monthlyRev = await query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month,
      COALESCE(SUM(amount), 0) as revenue
    FROM transactions
    WHERE status = 'completed'
      AND created_at > NOW() - INTERVAL '7 months'
    GROUP BY DATE_TRUNC('month', created_at)
    ORDER BY DATE_TRUNC('month', created_at)
  `);

  res.json({
    users:        users.rows[0],
    bookings:     bookings.rows[0],
    revenue:      revenue.rows[0],
    top_services: topServices.rows,
    monthly_revenue: monthlyRev.rows,
  });
}));

// PATCH /api/users/:id/block — admin toggle block
router.patch('/:id/block', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  // Prevent blocking yourself
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot block your own admin account.' });
  }

  const result = await query(
    `UPDATE users SET is_blocked = NOT is_blocked
     WHERE id = $1 AND role != 'admin'
     RETURNING id, name, is_blocked`,
    [req.params.id]
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found or cannot block an admin.' });
  }

  const user = result.rows[0];
  // If blocking, revoke all sessions
  if (user.is_blocked) {
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
  }

  res.json({
    message: user.is_blocked ? `${user.name} has been blocked.` : `${user.name} has been unblocked.`,
    is_blocked: user.is_blocked,
  });
}));

// DELETE /api/users/:id — admin delete user
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own admin account.' });
  }

  const result = await query(
    'DELETE FROM users WHERE id = $1 AND role != $2 RETURNING name',
    [req.params.id, 'admin']
  );
  if (!result.rows.length) {
    return res.status(404).json({ error: 'User not found or cannot delete an admin.' });
  }

  res.json({ message: `User ${result.rows[0].name} deleted permanently.` });
}));

module.exports = router;

const jwt  = require('jsonwebtoken');
const { query } = require('../config/db');

// Verify JWT token — attaches req.user on success
const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided. Please log in.' });
    }

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch fresh user from DB (catches blocked/deleted users)
    const result = await query(
      'SELECT id, name, email, phone, role, avatar_url, is_blocked FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'User no longer exists.' });
    }

    const user = result.rows[0];
    if (user.is_blocked) {
      return res.status(403).json({ error: 'Your account has been suspended. Contact support.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.', code: 'TOKEN_EXPIRED' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token.' });
    }
    next(err);
  }
};

// Admin-only guard — use AFTER authenticate
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
};

// Optional auth — sets req.user if token present, doesn't block if absent
const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) return next();
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await query('SELECT id, name, email, role FROM users WHERE id = $1', [decoded.userId]);
    if (result.rows.length) req.user = result.rows[0];
  } catch (_) { /* ignore */ }
  next();
};

module.exports = { authenticate, requireAdmin, optionalAuth };

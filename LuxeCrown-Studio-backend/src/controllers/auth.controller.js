const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/db');
const emailService = require('../services/email.service');
const { asyncHandler } = require('../middleware/error.middleware');

// ---- Token helpers ----
const signAccessToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const signRefreshToken = () => uuidv4() + uuidv4(); // opaque random token

const saveRefreshToken = async (userId, token) => {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [userId, token, expiresAt]
  );
};

// ============================================================
// POST /api/auth/register
// ============================================================
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  // Check duplicate email
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) {
    return res.status(409).json({ error: 'Email already registered. Please sign in.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const verifyToken  = uuidv4();

  const result = await query(
    `INSERT INTO users (name, email, phone, password_hash, verify_token)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, phone, role, created_at`,
    [name.trim(), email.toLowerCase().trim(), phone || null, passwordHash, verifyToken]
  );

  const user = result.rows[0];

  // Send welcome + verification email
  await emailService.sendWelcome(user, verifyToken).catch(console.error);

  const accessToken  = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken();
  await saveRefreshToken(user.id, refreshToken);

  res.status(201).json({
    message: 'Account created successfully! Please check your email to verify.',
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
});

// ============================================================
// POST /api/auth/login
// ============================================================
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const result = await query(
    'SELECT id, name, email, phone, role, password_hash, is_blocked, avatar_url FROM users WHERE email = $1',
    [email.toLowerCase().trim()]
  );

  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const user = result.rows[0];

  if (user.is_blocked) {
    return res.status(403).json({ error: 'Account suspended. Please contact support.' });
  }
  if (!user.password_hash) {
    return res.status(400).json({ error: 'This account uses Google sign-in. Please continue with Google.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const accessToken  = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken();
  await saveRefreshToken(user.id, refreshToken);

  res.json({
    message: 'Login successful',
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url },
    accessToken,
    refreshToken,
  });
});

// ============================================================
// POST /api/auth/google
// Receives the Google ID token from the frontend (after Google Sign-In)
// ============================================================
const googleAuth = asyncHandler(async (req, res) => {
  const { idToken } = req.body;
  if (!idToken) return res.status(400).json({ error: 'Google ID token required.' });

  // Verify with Google
  const axios = require('axios');
  const googleRes = await axios.get(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
  );

  const { sub: googleId, email, name, picture } = googleRes.data;

  if (!email) return res.status(400).json({ error: 'Could not retrieve email from Google.' });

  // Find or create user
  let user = (await query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [googleId, email])).rows[0];

  if (!user) {
    const result = await query(
      `INSERT INTO users (name, email, google_id, avatar_url, is_verified)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id, name, email, role, avatar_url`,
      [name, email.toLowerCase(), googleId, picture]
    );
    user = result.rows[0];
    await emailService.sendWelcome(user, null).catch(console.error);
  } else if (!user.google_id) {
    // Link Google to existing email account
    await query('UPDATE users SET google_id = $1, avatar_url = $2, is_verified = TRUE WHERE id = $3',
      [googleId, picture, user.id]);
  }

  if (user.is_blocked) {
    return res.status(403).json({ error: 'Account suspended. Contact support.' });
  }

  const accessToken  = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken();
  await saveRefreshToken(user.id, refreshToken);

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_url: user.avatar_url },
    accessToken,
    refreshToken,
  });
});

// ============================================================
// POST /api/auth/refresh
// ============================================================
const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return res.status(400).json({ error: 'Refresh token required.' });

  const result = await query(
    `SELECT rt.user_id, u.role FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token = $1 AND rt.expires_at > NOW()`,
    [token]
  );

  if (!result.rows.length) {
    return res.status(401).json({ error: 'Invalid or expired refresh token. Please log in again.' });
  }

  const { user_id, role } = result.rows[0];

  // Rotate: delete old, issue new
  await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  const newRefresh = signRefreshToken();
  await saveRefreshToken(user_id, newRefresh);

  res.json({
    accessToken:  signAccessToken(user_id, role),
    refreshToken: newRefresh,
  });
});

// ============================================================
// POST /api/auth/logout
// ============================================================
const logout = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (token) {
    await query('DELETE FROM refresh_tokens WHERE token = $1', [token]);
  }
  res.json({ message: 'Logged out successfully.' });
});

// ============================================================
// POST /api/auth/forgot-password
// ============================================================
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const result = await query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase()]);

  // Always return success to prevent email enumeration
  if (!result.rows.length) {
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  const user  = result.rows[0];
  const token = uuidv4();
  const exp   = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query('UPDATE users SET reset_token = $1, reset_expires = $2 WHERE id = $3', [token, exp, user.id]);
  await emailService.sendPasswordReset(user, token).catch(console.error);

  res.json({ message: 'If that email exists, a reset link has been sent.' });
});

// ============================================================
// POST /api/auth/reset-password
// ============================================================
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password are required.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const result = await query(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_expires > NOW()',
    [token]
  );
  if (!result.rows.length) {
    return res.status(400).json({ error: 'Reset link is invalid or expired. Request a new one.' });
  }

  const hash = await bcrypt.hash(password, 12);
  await query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_expires = NULL WHERE id = $2',
    [hash, result.rows[0].id]
  );

  // Invalidate all sessions
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [result.rows[0].id]);

  res.json({ message: 'Password reset successfully. Please log in with your new password.' });
});

// ============================================================
// GET /api/auth/me
// ============================================================
const getMe = asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT id, name, email, phone, role, avatar_url, is_verified, created_at FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json({ user: result.rows[0] });
});

module.exports = { register, login, googleAuth, refreshToken, logout, forgotPassword, resetPassword, getMe };

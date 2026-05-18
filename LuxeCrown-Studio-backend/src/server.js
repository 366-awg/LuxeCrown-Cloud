require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');

const authRoutes     = require('./routes/auth.routes');
const serviceRoutes  = require('./routes/service.routes');
const bookingRoutes  = require('./routes/booking.routes');
const paymentRoutes  = require('./routes/payment.routes');
const userRoutes     = require('./routes/user.routes');
const uploadRoutes   = require('./routes/upload.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app  = express();
const PORT = process.env.PORT || 5000;

// ---- Security ----
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://LuxeCrown-Studio.vercel.app',      // your Vercel domain
    'https://www.LuxeCrown-Studio.co.ke',       // your custom domain
  ],
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

// ---- Rate Limiting ----
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 100,
  message: { error: 'Too many requests. Please try again in 15 minutes.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,   // stricter for auth endpoints
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ---- Body Parsing ----
// IMPORTANT: raw body needed for M-Pesa webhook signature verification
app.use('/api/payments/mpesa/callback', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ---- Logging ----
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ---- Health Check ----
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'LuxeCrown-Studio API',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// ---- API Routes ----
app.use('/api/auth',     authRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/upload',   uploadRoutes);

// ---- 404 Handler ----
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ---- Global Error Handler ----
app.use(errorHandler);

// ---- Start Server ----
app.listen(PORT, () => {
  console.log(`\n🚀 LuxeCrown-Studio API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});

module.exports = app;

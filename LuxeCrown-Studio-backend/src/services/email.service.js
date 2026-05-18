const nodemailer = require('nodemailer');
require('dotenv').config();

// ---- Transporter ----const t
const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,   // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify transporter on startup (non-blocking)
transporter.verify().then(() => {
  console.log('✅ Email service ready');
}).catch(err => {
  console.warn('⚠️  Email service unavailable:', err.message);
});

// ---- Shared email wrapper ----
const sendMail = async ({ to, subject, html }) => {
  return transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

// ---- Base HTML layout ----
const layout = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LuxeCrown-Studio</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0A0A0A; color: #F5F0E8; }
    .wrap  { max-width:600px; margin:40px auto; background:#111111;
             border:1px solid rgba(200,169,110,0.15); border-radius:16px; overflow:hidden; }
    .head  { background:linear-gradient(135deg,#111,#1A1A1A); padding:36px 40px;
             border-bottom:1px solid rgba(200,169,110,0.12); text-align:center; }
    .logo  { font-size:28px; font-weight:800; color:#C8A96E; letter-spacing:-1px; }
    .logo span { color:#F5F0E8; }
    .body  { padding:36px 40px; }
    h2     { font-size:22px; font-weight:700; color:#F5F0E8; margin-bottom:8px; }
    p      { font-size:15px; color:#CCCCCC; line-height:1.75; margin-bottom:14px; }
    .box   { background:#1A1A1A; border:1px solid rgba(200,169,110,0.12);
             border-radius:12px; padding:22px; margin:20px 0; }
    .row   { display:flex; justify-content:space-between; padding:9px 0;
             border-bottom:1px solid rgba(200,169,110,0.07); font-size:14px; }
    .row:last-child { border:none; }
    .lbl   { color:#888888; }
    .val   { color:#F5F0E8; font-weight:500; }
    .gold  { color:#C8A96E; font-size:20px; font-weight:800; }
    .btn   { display:inline-block; background:#C8A96E; color:#0A0A0A;
             text-decoration:none; padding:14px 32px; border-radius:40px;
             font-weight:700; font-size:15px; margin:8px 0; }
    .badge-success { display:inline-block; background:rgba(46,204,113,0.12);
                     color:#2ECC71; padding:4px 14px; border-radius:20px;
                     font-size:12px; font-weight:700; letter-spacing:0.06em; }
    .foot  { background:#0A0A0A; padding:24px 40px; text-align:center;
             border-top:1px solid rgba(200,169,110,0.07); }
    .foot p { font-size:12px; color:#555555; margin:0; }
    .foot a { color:#C8A96E; text-decoration:none; }
    .mpesa { background:rgba(0,166,81,0.1); border:1px solid rgba(0,166,81,0.2);
             border-radius:10px; padding:14px; margin:16px 0; text-align:center; }
    .mpesa-logo { background:#00A651; color:#fff; font-weight:800; font-size:13px;
                  padding:5px 12px; border-radius:6px; display:inline-block; }
  </style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div class="logo">Urban<span>Edge</span></div>
    <div style="font-size:12px;color:#888;margin-top:4px;font-family:monospace">SALON & BARBERSHOP · NAIROBI 🇰🇪</div>
  </div>
  ${content}
  <div class="foot">
    <p>LuxeCrown-Studio · Tom Mboya Street, Nairobi CBD · <a href="tel:+254700000000">+254 700 000 000</a></p>
    <p style="margin-top:6px">© 2025 LuxeCrown-Studio · <a href="#">Unsubscribe</a></p>
  </div>
</div>
</body>
</html>`;


const sendWelcome = async (user, verifyToken) => {
  const verifyLink = verifyToken
    ? `${process.env.FRONTEND_URL}/verify-email?token=${verifyToken}`
    : null;

  await sendMail({
    to:      user.email,
    subject: '✂️ Welcome to LuxeCrown-Studio!',
    html: layout(`
      <div class="body">
        <h2>Welcome, ${user.name.split(' ')[0]}! 👋</h2>
        <p>You're officially part of the LuxeCrown-Studio family — Nairobi's premium salon & barbershop experience.</p>
        <p>Book your first appointment in under 2 minutes and pay easily via M-Pesa.</p>
        ${verifyLink ? `
        <p style="text-align:center;margin-top:24px">
          <a href="${verifyLink}" class="btn">Verify My Email →</a>
        </p>
        ` : ''}
        <div class="box" style="margin-top:24px">
          <div style="font-size:13px;color:#888;margin-bottom:8px;font-family:monospace;letter-spacing:0.06em">QUICK LINKS</div>
          <p style="margin:0"><a href="${process.env.FRONTEND_URL}/services" style="color:#C8A96E">→ Browse Services</a></p>
          <p style="margin:8px 0 0"><a href="${process.env.FRONTEND_URL}/booking" style="color:#C8A96E">→ Book Appointment</a></p>
        </div>
      </div>
    `),
  });
};


const sendBookingConfirmation = async (booking, mpesaReceipt) => {
  const email = booking.customer_email || booking.user_email;
  if (!email) return;

  await sendMail({
    to:      email,
    subject: `✅ Booking Confirmed — ${booking.service_name} | LuxeCrown-Studio`,
    html: layout(`
      <div class="body">
        <h2>Booking Confirmed! 🎉</h2>
        <p>Hi ${booking.customer_name}, your appointment at LuxeCrown-Studio has been confirmed and payment received.</p>
        <div class="box">
          <div style="font-size:13px;color:#888;margin-bottom:12px;font-family:monospace;letter-spacing:0.06em">BOOKING DETAILS</div>
          <div class="row"><span class="lbl">Booking ID</span><span class="val" style="color:#C8A96E;font-family:monospace">#${booking.id?.substring(0,8).toUpperCase()}</span></div>
          <div class="row"><span class="lbl">Service</span><span class="val">${booking.service_name}</span></div>
          <div class="row"><span class="lbl">Date</span><span class="val">${booking.booking_date}</span></div>
          <div class="row"><span class="lbl">Time</span><span class="val">${booking.booking_time}</span></div>
          <div class="row"><span class="lbl">Phone</span><span class="val">${booking.customer_phone}</span></div>
          <div class="row"><span class="lbl">Amount Paid</span><span class="gold">KES ${booking.service_price?.toLocaleString()}</span></div>
        </div>
        <div class="mpesa">
          <div class="mpesa-logo">M-PESA</div>
          <div style="font-size:13px;color:#00A651;margin-top:8px;font-weight:600">Payment Received</div>
          <div style="font-size:12px;color:#888;font-family:monospace;margin-top:4px">Ref: ${mpesaReceipt || 'N/A'}</div>
        </div>
        <p style="font-size:13px;color:#888;margin-top:16px">
          📍 Tom Mboya Street, Nairobi CBD · Urban Plaza 2nd Floor<br>
          📞 +254 700 000 000 · <a href="https://wa.me/254700000000" style="color:#C8A96E">WhatsApp</a>
        </p>
        <p style="text-align:center;margin-top:20px">
          <a href="${process.env.FRONTEND_URL}/dashboard" class="btn">View My Bookings →</a>
        </p>
      </div>
    `),
  });
};


const sendPaymentFailed = async (userEmail, userName, bookingId) => {
  await sendMail({
    to:      userEmail,
    subject: '⚠️ Payment Not Received — LuxeCrown-Studio',
    html: layout(`
      <div class="body">
        <h2>Payment Not Completed</h2>
        <p>Hi ${userName}, we didn't receive your M-Pesa payment for booking <strong style="color:#C8A96E">#${bookingId?.substring(0,8).toUpperCase()}</strong>.</p>
        <p>Your booking slot is still available. Please try again to confirm your appointment.</p>
        <p style="text-align:center;margin-top:24px">
          <a href="${process.env.FRONTEND_URL}/booking" class="btn">Try Again →</a>
        </p>
        <p style="font-size:13px;color:#888">Need help? WhatsApp us at <a href="https://wa.me/254700000000" style="color:#C8A96E">+254 700 000 000</a></p>
      </div>
    `),
  });
};


const sendAppointmentReminder = async (booking) => {
  const email = booking.customer_email || booking.user_email;
  if (!email) return;

  await sendMail({
    to:      email,
    subject: `⏰ Reminder: Your appointment tomorrow — LuxeCrown-Studio`,
    html: layout(`
      <div class="body">
        <h2>See you tomorrow! ✂️</h2>
        <p>Hi ${booking.customer_name}, this is a friendly reminder about your appointment at LuxeCrown-Studio tomorrow.</p>
        <div class="box">
          <div class="row"><span class="lbl">Service</span><span class="val">${booking.service_name}</span></div>
          <div class="row"><span class="lbl">Date</span><span class="val">${booking.booking_date}</span></div>
          <div class="row"><span class="lbl">Time</span><span class="val">${booking.booking_time}</span></div>
        </div>
        <p>📍 <strong>Tom Mboya Street, Nairobi CBD</strong> — Urban Plaza, 2nd Floor</p>
        <p style="font-size:13px;color:#888">Need to reschedule? Contact us on WhatsApp: <a href="https://wa.me/254700000000" style="color:#C8A96E">+254 700 000 000</a></p>
      </div>
    `),
  });
};


//  PASSWORD RESET EMAIL

const sendPasswordReset = async (user, token) => {
  const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

  await sendMail({
    to:      user.email,
    subject: '🔑 Reset Your LuxeCrown-Studio Password',
    html: layout(`
      <div class="body">
        <h2>Password Reset</h2>
        <p>Hi ${user.name}, someone requested a password reset for your LuxeCrown-Studio account.</p>
        <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${resetLink}" class="btn">Reset My Password →</a>
        </p>
        <p style="font-size:13px;color:#888">If you didn't request this, you can safely ignore this email. Your password will not change.</p>
      </div>
    `),
  });
};

module.exports = {
  sendWelcome,
  sendBookingConfirmation,
  sendPaymentFailed,
  sendAppointmentReminder,
  sendPasswordReset,
};

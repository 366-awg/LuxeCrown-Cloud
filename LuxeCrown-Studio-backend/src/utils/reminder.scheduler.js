/**
 * Reminder Scheduler
 * Sends appointment reminder emails 24 hours before each booking.
 * Called from server.js on startup.
 *
 * In production: replace with a cron job (node-cron) or AWS EventBridge.
 */

const { query }   = require('../config/db');
const emailService = require('../services/email.service');

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL    = 60 * 60 * 1000; // check every hour

async function sendDueReminders() {
  try {
    // Find confirmed bookings where booking_date = tomorrow
    // and reminder has not been sent yet
    const result = await query(`
      SELECT b.*,
             u.email  AS user_email,
             u.name   AS user_name
      FROM bookings b
      JOIN users u ON u.id = b.user_id
      WHERE b.status = 'confirmed'
        AND b.booking_date = CURRENT_DATE + INTERVAL '1 day'
        AND b.reminder_sent IS NOT TRUE
    `);

    for (const booking of result.rows) {
      try {
        await emailService.sendAppointmentReminder({
          ...booking,
          customer_email: booking.customer_email || booking.user_email,
          customer_name:  booking.customer_name  || booking.user_name,
        });

        // Mark reminder as sent so we don't double-send
        await query(
          'UPDATE bookings SET reminder_sent = TRUE WHERE id = $1',
          [booking.id]
        );

        console.log(`[Reminder] ✅ Sent to ${booking.customer_email} for booking ${booking.id}`);
      } catch (emailErr) {
        console.error(`[Reminder] ❌ Failed for ${booking.id}:`, emailErr.message);
      }
    }

    if (result.rows.length === 0) {
      console.log('[Reminder] No reminders due right now.');
    }
  } catch (err) {
    console.error('[Reminder Scheduler] DB error:', err.message);
  }
}

function startReminderScheduler() {
  console.log('⏰ Appointment reminder scheduler started (runs every hour)');
  // Run once on startup, then every hour
  sendDueReminders();
  setInterval(sendDueReminders, CHECK_INTERVAL);
}

module.exports = { startReminderScheduler };

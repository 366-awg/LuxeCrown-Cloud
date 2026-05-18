const axios  = require('axios');
const moment = require('moment');
const { query, withTransaction } = require('../config/db');
const emailService = require('./email.service');

const SANDBOX_BASE = 'https://sandbox.safaricom.co.ke';
const LIVE_BASE    = 'https://api.safaricom.co.ke';

const BASE_URL = process.env.MPESA_ENV === 'production' ? LIVE_BASE : SANDBOX_BASE;

// 1. GET ACCESS TOKEN
const getAccessToken = async () => {
  const key    = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await axios.get(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  return res.data.access_token;
};


//  GENERATE STK PUSH PASSWORD
// Password = Base64(ShortCode + PassKey + Timestamp)

const getPassword = (timestamp) => {
  const shortCode = process.env.MPESA_SHORTCODE;
  const passKey   = process.env.MPESA_PASSKEY;
  return Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');
};


//  INITIATE STK PUSH

const initiateSTKPush = async ({ phone, amount, bookingId, userId, description }) => {
  const token     = await getAccessToken();
  const timestamp = moment().format('YYYYMMDDHHmmss');
  const password  = getPassword(timestamp);

  // Normalize phone: 0712345678 → 254712345678
  const normalizedPhone = phone.replace(/^0/, '254').replace(/^\+/, '').replace(/\s/g, '');

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password:          password,
    Timestamp:         timestamp,
    TransactionType:   'CustomerPayBillOnline',
    Amount:            Math.ceil(amount),      // must be integer KES
    PartyA:            normalizedPhone,
    PartyB:            process.env.MPESA_SHORTCODE,
    PhoneNumber:       normalizedPhone,
    CallBackURL:       process.env.MPESA_CALLBACK_URL,
    AccountReference:  `LuxeCrown-Studio-${bookingId?.substring(0, 8).toUpperCase() || 'BK'}`,
    TransactionDesc:   description || 'LuxeCrown-Studio Salon Booking',
  };

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  const { CheckoutRequestID, MerchantRequestID, ResponseCode, ResponseDescription } = res.data;

  if (ResponseCode !== '0') {
    throw new Error(ResponseDescription || 'STK Push failed. Please try again.');
  }

  // Save pending transaction
  await query(
    `INSERT INTO transactions
      (booking_id, user_id, phone_number, amount, mpesa_checkout_id, merchant_request_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
    [bookingId || null, userId || null, normalizedPhone, amount, CheckoutRequestID, MerchantRequestID]
  );

  return { checkoutRequestId: CheckoutRequestID, merchantRequestId: MerchantRequestID };
};


// 4. HANDLE STK CALLBACK
// Safaricom POSTs to your MPESA_CALLBACK_URL after payment

const handleCallback = async (rawBody) => {
  let body;
  try {
    body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
  } catch {
    console.error('[M-Pesa] Invalid callback body');
    return;
  }

  const { Body } = body;
  const { stkCallback } = Body;
  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

  console.log(`[M-Pesa] Callback: CheckoutRequestID=${CheckoutRequestID}, ResultCode=${ResultCode}`);

  if (ResultCode === 0) {
    // SUCCESS — extract metadata
    const meta = {};
    (CallbackMetadata?.Item || []).forEach(({ Name, Value }) => { meta[Name] = Value; });

    const mpesaReceipt = meta['MpesaReceiptNumber'];
    const amount       = meta['Amount'];
    const phone        = meta['PhoneNumber'];

    await withTransaction(async (client) => {
      // Update transaction
      const txnResult = await client.query(
        `UPDATE transactions
         SET status = 'completed', mpesa_receipt = $1, result_code = 0, result_desc = $2, updated_at = NOW()
         WHERE mpesa_checkout_id = $3
         RETURNING booking_id, user_id`,
        [mpesaReceipt, ResultDesc, CheckoutRequestID]
      );

      if (!txnResult.rows.length) {
        console.warn('[M-Pesa] No transaction found for CheckoutRequestID:', CheckoutRequestID);
        return;
      }

      const { booking_id } = txnResult.rows[0];

      // Confirm booking
      if (booking_id) {
        const bkResult = await client.query(
          `UPDATE bookings SET status = 'confirmed', updated_at = NOW()
           WHERE id = $1
           RETURNING *, (SELECT email FROM users WHERE id = bookings.user_id) as user_email`,
          [booking_id]
        );

        const booking = bkResult.rows[0];
        if (booking) {
          // Send confirmation email async
          emailService.sendBookingConfirmation(booking, mpesaReceipt).catch(console.error);
          console.log(`[M-Pesa] ✅ Booking ${booking_id} confirmed. Receipt: ${mpesaReceipt}`);
        }
      }
    });
  } else {
    // FAILED or CANCELLED
    await query(
      `UPDATE transactions
       SET status = 'failed', result_code = $1, result_desc = $2, updated_at = NOW()
       WHERE mpesa_checkout_id = $3`,
      [ResultCode, ResultDesc, CheckoutRequestID]
    );
    console.log(`[M-Pesa] ❌ Payment failed. Code: ${ResultCode}, Desc: ${ResultDesc}`);
  }
};

// ============================================================
// 5. QUERY STK PUSH STATUS
// Use this to manually check payment status
// ============================================================
const querySTKStatus = async (checkoutRequestId) => {
  const token     = await getAccessToken();
  const timestamp = moment().format('YYYYMMDDHHmmss');
  const password  = getPassword(timestamp);

  const res = await axios.post(
    `${BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password:          password,
      Timestamp:         timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  return res.data;
};

module.exports = { initiateSTKPush, handleCallback, querySTKStatus };

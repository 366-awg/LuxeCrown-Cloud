

require('dotenv').config();
const bcrypt  = require('bcryptjs');
const { pool, query } = require('./db');

async function seed() {
  console.log('🌱 Seeding database...\n');

  try {
    // ---- 1. Create Admin User ----
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@LuxeCrown-Studio.co.ke';
    const adminPass = process.env.ADMIN_PASSWORD;
if (!adminPass) {
  throw new Error('ADMIN_PASSWORD must be set in the environment.');
}
    const adminName  = process.env.ADMIN_NAME || 'LuxeCrown-Studio Admin';

    const existing = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length) {
      console.log(`⚠️  Admin already exists: ${adminEmail}`);
    } else {
      const hash = await bcrypt.hash(adminPass, 12);
      await query(
        `INSERT INTO users (name, email, password_hash, role, is_verified)
         VALUES ($1, $2, $3, 'admin', TRUE)`,
        [adminName, adminEmail, hash]
      );
      console.log(`✅ Admin created: ${adminEmail}`);
    }

    // ---- 2. Create Test User ----
    const testEmail = 'test@LuxeCrown-Studio.co.ke';
    const testExists = await query('SELECT id FROM users WHERE email = $1', [testEmail]);
    if (!testExists.rows.length) {
      const hash = await bcrypt.hash('Test1234!', 12);
      await query(
        `INSERT INTO users (name, email, phone, password_hash, is_verified)
         VALUES ('Brian Mutua', $1, '0712345678', $2, TRUE)`,
        [testEmail, hash]
      );
      console.log(`✅ Test user created: ${testEmail} / Test1234!`);
    }

    // ---- 3. Verify services exist ----
    const svcCount = await query('SELECT COUNT(*) FROM services');
    console.log(`✅ Services in DB: ${svcCount.rows[0].count}`);

    // ---- 4. Sample bookings (if none exist) ----
    const bkCount = await query('SELECT COUNT(*) FROM bookings');
    if (parseInt(bkCount.rows[0].count) === 0) {
      const user = await query('SELECT id FROM users WHERE email = $1', [testEmail]);
      const svcs = await query('SELECT id, name, price FROM services LIMIT 3');

      if (user.rows.length && svcs.rows.length) {
        const userId = user.rows[0].id;
        const samples = [
          { svc: svcs.rows[0], date: '2025-05-15', time: '9:00 AM',  status: 'confirmed' },
          { svc: svcs.rows[1], date: '2025-05-16', time: '11:00 AM', status: 'pending'   },
          { svc: svcs.rows[2], date: '2025-05-17', time: '2:00 PM',  status: 'confirmed' },
        ];

        for (const s of samples) {
          await query(
            `INSERT INTO bookings
               (user_id, service_id, service_name, service_price,
                customer_name, customer_email, customer_phone,
                booking_date, booking_time, status)
             VALUES ($1,$2,$3,$4,'Brian Mutua','test@LuxeCrown-Studio.co.ke','0712345678',$5,$6,$7)`,
            [userId, s.svc.id, s.svc.name, s.svc.price, s.date, s.time, s.status]
          );
        }
        console.log('✅ Sample bookings created (3)');
      }
    } else {
      console.log(`✅ Bookings already exist (${bkCount.rows[0].count})`);
    }

    console.log('\n🎉 Seeding complete!\n');
    console.log('---------------------------------------------');
    console.log(`Admin login : ${adminEmail}`);
    console.log('---------------------------------------------\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();

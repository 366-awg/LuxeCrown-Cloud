-- ============================================
-- LuxeCrown-Studio DATABASE SCHEMA
-- Run this file to create all tables
-- Command: psql -h HOST -U postgres -d LuxeCrown-Studio -f schema.sql
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  phone         VARCHAR(20),
  password_hash VARCHAR(255),          -- NULL for Google OAuth users
  role          VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  avatar_url    TEXT,
  google_id     VARCHAR(100) UNIQUE,   -- for Google OAuth
  is_blocked    BOOLEAN DEFAULT FALSE,
  is_verified   BOOLEAN DEFAULT FALSE,
  verify_token  VARCHAR(255),
  reset_token   VARCHAR(255),
  reset_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_google_id ON users(google_id);

-- ============================================
-- SERVICES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(50) NOT NULL CHECK (category IN ('Barber', 'Salon')),
  icon        VARCHAR(10) DEFAULT '✂️',
  description TEXT NOT NULL,
  price       INTEGER NOT NULL CHECK (price > 0),   -- in KES (no decimals)
  duration    VARCHAR(30) NOT NULL,                  -- e.g. "45 min"
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SERVICE IMAGES TABLE
-- Separate table — a service can have many images
-- ============================================
CREATE TABLE IF NOT EXISTS service_images (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,           -- Cloudinary URL
  public_id   TEXT,                    -- Cloudinary public_id (for deletion)
  alt_text    VARCHAR(200),
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_images_service ON service_images(service_id);

-- ============================================
-- BOOKINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_id      UUID NOT NULL REFERENCES services(id),
  service_name    VARCHAR(100) NOT NULL,  -- denormalized for history
  service_price   INTEGER NOT NULL,       -- denormalized for history
  customer_name   VARCHAR(100) NOT NULL,
  customer_email  VARCHAR(255),
  customer_phone  VARCHAR(20) NOT NULL,
  booking_date    DATE NOT NULL,
  booking_time    VARCHAR(20) NOT NULL,   -- e.g. "9:00 AM"
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_date ON bookings(booking_date);
CREATE INDEX idx_bookings_status ON bookings(status);
-- Prevent double booking
CREATE UNIQUE INDEX idx_no_double_booking
  ON bookings(booking_date, booking_time)
  WHERE status NOT IN ('cancelled');

-- ============================================
-- PAYMENTS / TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id        UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id           UUID REFERENCES users(id),
  phone_number      VARCHAR(20) NOT NULL,
  amount            INTEGER NOT NULL,           -- in KES
  mpesa_checkout_id VARCHAR(100) UNIQUE,        -- CheckoutRequestID from Daraja
  mpesa_receipt     VARCHAR(100),               -- MpesaReceiptNumber on success
  merchant_request_id VARCHAR(100),
  status            VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  result_code       INTEGER,
  result_desc       TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_booking ON transactions(booking_id);
CREATE INDEX idx_transactions_checkout ON transactions(mpesa_checkout_id);
CREATE INDEX idx_transactions_status ON transactions(status);

-- ============================================
-- REFRESH TOKENS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      VARCHAR(500) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_services_updated
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_bookings_updated
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_transactions_updated
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- DEFAULT SEED DATA — SERVICES
-- ============================================
INSERT INTO services (name, category, icon, description, price, duration, sort_order) VALUES
  ('Classic Haircut',      'Barber', '✂️', 'Precision cut with clippers & scissors. Any style — fade, taper, skin cut.',    300,  '45 min', 1),
  ('Beard Trim & Shape',   'Barber', '🪒', 'Clean beard line-up with razor finish and hot towel treatment.',                 200,  '30 min', 2),
  ('Hair Dye & Colour',    'Barber', '🎨', 'Full colour, highlights, ombre, or balayage. Premium dyes, vibrant results.',   800,  '90 min', 3),
  ('Kids Haircut',         'Barber', '👦', 'Fun, patient cuts for kids aged 2–12. We make every visit enjoyable.',          200,  '30 min', 4),
  ('Braiding',             'Salon',  '💆', 'Box braids, cornrows, knotless, Senegalese twists and more. Any style.',        1200, '2–4 hrs', 5),
  ('Hair Wash & Blow Dry', 'Salon',  '💧', 'Deep cleanse shampoo with conditioning treatment and professional blow dry.',   500,  '45 min', 6),
  ('Wig Installation',     'Salon',  '👑', 'Full wig install — lace front, glueless, half wigs. Natural look guaranteed.', 1000, '1.5 hrs', 7),
  ('Nail Services',        'Salon',  '💅', 'Manicure, pedicure, gel nails, acrylic and nail art. Your nails, your way.',   600,  '1 hr',   8)
ON CONFLICT DO NOTHING;

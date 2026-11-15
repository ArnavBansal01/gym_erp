-- AURA Athletic Club : PostgreSQL schema (Supabase). Re-runnable.
DROP VIEW  IF EXISTS membership_status;
DROP TABLE IF EXISTS attendance_logs, payments, expenses, memberships, plans, users CASCADE;

CREATE TABLE users (
  uid                TEXT PRIMARY KEY,                 -- Firebase Auth uid
  role               TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','trainer','admin')),
  name               TEXT NOT NULL DEFAULT '',
  email              TEXT NOT NULL DEFAULT '',
  phone              TEXT NOT NULL DEFAULT '',
  status             TEXT,                             -- members: active ; trainers: pending/approved/rejected/revoked
  current_status     TEXT NOT NULL DEFAULT 'OUT' CHECK (current_status IN ('IN','OUT')),
  assigned_trainer_uid TEXT REFERENCES users(uid) ON DELETE SET NULL, -- NULL = General Floor Coach
  specialization     TEXT,
  experience         TEXT,
  total_sessions     INTEGER NOT NULL DEFAULT 0 CHECK (total_sessions >= 0),
  today_sessions     INTEGER NOT NULL DEFAULT 0,
  daily_session_count INTEGER NOT NULL DEFAULT 0,
  shifts_assigned    INTEGER NOT NULL DEFAULT 0,
  shifts_attended    INTEGER NOT NULL DEFAULT 0,
  scheduled_sessions INTEGER NOT NULL DEFAULT 30,
  rating             NUMERIC NOT NULL DEFAULT 0 CHECK (rating >= 0),
  message            TEXT,
  trainer_notes      TEXT,
  last_check_in_date TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active        TIMESTAMPTZ,
  last_check_in      TIMESTAMPTZ,
  requested_at       TIMESTAMPTZ,
  approved_at        TIMESTAMPTZ,
  rejected_at        TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ,
  joining_date       TIMESTAMPTZ,
  extra              JSONB NOT NULL DEFAULT '{}'::jsonb  -- any rarely-used legacy Firestore field
);
CREATE INDEX idx_users_role_status ON users(role, current_status);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_email ON users(lower(email));
CREATE INDEX idx_users_trainer ON users(assigned_trainer_uid);

-- Catalogue of plans (was hard-coded in lib/membershipUtils.ts)
CREATE TABLE plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, tier TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price > 0), duration_months INTEGER NOT NULL CHECK (duration_months > 0)
);
INSERT INTO plans VALUES
 ('monthly-standard','Monthly Standard','Standard',2500,1),
 ('quarterly-pro','Quarterly Pro','Pro',6500,3),
 ('annual-vip','Annual VIP Pass','VIP',18000,12);

-- One row per subscription period; latest row = member's current plan
CREATE TABLE memberships (
  id            BIGSERIAL PRIMARY KEY,
  member_uid    TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  plan_name     TEXT NOT NULL,
  plan_tier     TEXT,
  price         TEXT,
  duration_months INTEGER,
  start_date    TIMESTAMPTZ,
  end_date      TIMESTAMPTZ,
  plan_status   TEXT,
  last_renewed  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_memberships_member ON memberships(member_uid, id DESC);

CREATE TABLE payments (
  id          BIGSERIAL PRIMARY KEY,
  member_uid  TEXT REFERENCES users(uid) ON DELETE SET NULL,
  member_name TEXT, member_email TEXT, plan_name TEXT,
  amount      NUMERIC NOT NULL CHECK (amount >= 0),
  months      INTEGER,
  type        TEXT NOT NULL DEFAULT 'MEMBERSHIP_RENEWAL',
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_member ON payments(member_uid);

-- Merges Firestore: global `logs` + users/*/attendance_logs + users/*/trainer_logs
CREATE TABLE attendance_logs (
  id            BIGSERIAL PRIMARY KEY,
  user_uid      TEXT REFERENCES users(uid) ON DELETE CASCADE,
  user_name     TEXT, user_email TEXT,
  role          TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('MEMBER','TRAINER')),
  type          TEXT NOT NULL CHECK (type IN ('CHECK-IN','CHECK-OUT')),
  gym_id        TEXT NOT NULL DEFAULT 'AURA_CLUB_MAIN_ENTRANCE',
  source        TEXT,
  status        TEXT,
  check_in_time TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_att_user_time ON attendance_logs(user_uid, logged_at DESC);
CREATE INDEX idx_att_time ON attendance_logs(logged_at DESC);

CREATE TABLE expenses (
  id         BIGSERIAL PRIMARY KEY,
  category   TEXT NOT NULL DEFAULT 'General',
  amount     NUMERIC NOT NULL CHECK (amount >= 0),
  spent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_expenses_time ON expenses(spent_at DESC);

-- Active / Expiring (<=7 days) / Expired computed from the latest membership
CREATE VIEW membership_status AS
SELECT DISTINCT ON (m.member_uid) m.member_uid, u.name, m.plan_name, m.end_date,
  CASE WHEN m.end_date IS NULL THEN 'ACTIVE'
       WHEN m.end_date < now() THEN 'EXPIRED'
       WHEN m.end_date < now() + interval '7 days' THEN 'EXPIRING'
       ELSE 'ACTIVE' END AS status
FROM memberships m JOIN users u ON u.uid = m.member_uid
ORDER BY m.member_uid, m.id DESC;

ALTER TABLE vaults
  ADD COLUMN declared_last_sequence   INTEGER,
  ADD COLUMN declared_total_usd_minor BIGINT,
  ADD COLUMN released_at              TIMESTAMPTZ;


CREATE TABLE vouchers (
  position         BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  id               TEXT PRIMARY KEY,
  vault_id         TEXT NOT NULL REFERENCES vaults (id),
  sequence         INTEGER NOT NULL CHECK (sequence > 0),
  payload_hash     TEXT NOT NULL,
  payload          JSONB NOT NULL,
  signature        TEXT NOT NULL,
  receipt          JSONB,
  payer_device_id  TEXT NOT NULL REFERENCES devices (id),
  payee_device_id  TEXT NOT NULL REFERENCES devices (id),
  payer_name       TEXT NOT NULL,
  payee_name       TEXT NOT NULL,
  amount_ngn_minor BIGINT NOT NULL CHECK (amount_ngn_minor > 0),
  amount_usd_minor BIGINT NOT NULL CHECK (amount_usd_minor > 0),
  status           TEXT NOT NULL CHECK (status IN (
    'SETTLING', 'RETRYABLE_FAILURE', 'SETTLED',
    'SETTLEMENT_BLOCKED', 'REJECTED_CONFLICT', 'REJECTED_OVERSPEND'
  )),
  paypal_capture_id TEXT UNIQUE,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ,
  lease_until      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL,
  UNIQUE (vault_id, sequence)
);


CREATE INDEX vouchers_payer_history ON vouchers (payer_device_id, position DESC);
CREATE INDEX vouchers_payee_history ON vouchers (payee_device_id, position DESC);


CREATE TABLE ledger_entries (
  position          BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL REFERENCES devices (id),
  type              TEXT NOT NULL CHECK (type IN ('CREDIT', 'WITHDRAWAL', 'REVERSAL')),
  amount_usd_minor  BIGINT NOT NULL CHECK (amount_usd_minor > 0),
  amount_ngn_minor  BIGINT NOT NULL,
  voucher_id        TEXT REFERENCES vouchers (id),
  paypal_capture_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  UNIQUE (voucher_id, type)
);


CREATE INDEX ledger_entries_device ON ledger_entries (device_id, position DESC);


CREATE TABLE alerts (
  position   BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  vault_id   TEXT NOT NULL REFERENCES vaults (id),
  voucher_id TEXT,
  details    JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);


CREATE TABLE paypal_events (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

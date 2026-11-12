-- Add money: a PayPal checkout that is captured straight into the Online wallet.
-- SELF is a person adding to their own wallet; LINK is someone paying through a pay link.
CREATE TABLE deposits (
  id                TEXT PRIMARY KEY,
  device_id         TEXT NOT NULL REFERENCES devices (id),
  source            TEXT NOT NULL DEFAULT 'SELF' CHECK (source IN ('SELF', 'LINK')),
  order_id          TEXT NOT NULL UNIQUE,
  amount_usd_minor  BIGINT NOT NULL CHECK (amount_usd_minor > 0),
  amount_ngn_minor  BIGINT NOT NULL CHECK (amount_ngn_minor > 0),
  status            TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  paypal_capture_id TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
);


CREATE INDEX deposits_by_device ON deposits (device_id, created_at DESC);


-- One public link per account, so someone with no T-Pay can pay it by PayPal.
CREATE TABLE pay_links (
  token      TEXT PRIMARY KEY,
  device_id  TEXT NOT NULL UNIQUE REFERENCES devices (id),
  created_at TIMESTAMPTZ NOT NULL
);


-- One credit per deposit, enforced by the database, so a repeated call can never pay twice.
ALTER TABLE ledger_entries
  ADD COLUMN deposit_id TEXT REFERENCES deposits (id),
  ADD CONSTRAINT ledger_entries_deposit_once UNIQUE (deposit_id, type),
  DROP CONSTRAINT ledger_entries_type_check,
  ADD CONSTRAINT ledger_entries_type_check CHECK (type IN (
    'CREDIT', 'WITHDRAWAL', 'REVERSAL', 'WITHDRAWAL_RETURNED', 'DEPOSIT', 'PAYMENT_LINK'
  ));


ALTER TABLE transaction_events
  DROP CONSTRAINT transaction_events_type_check,
  ADD CONSTRAINT transaction_events_type_check CHECK (type IN (
    'VAULT_LOCKED', 'VAULT_RELEASED', 'VOUCHER_SUBMITTED', 'VOUCHER_SETTLED',
    'VOUCHER_REJECTED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED',
    'DEPOSIT_COMPLETED', 'PAYMENT_LINK_RECEIVED'
  ));

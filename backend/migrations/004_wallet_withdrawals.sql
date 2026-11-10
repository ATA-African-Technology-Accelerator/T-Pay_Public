CREATE TABLE withdrawals (
  id               TEXT PRIMARY KEY,
  device_id        TEXT NOT NULL REFERENCES devices (id),
  receiver_email   TEXT NOT NULL,
  amount_usd_minor BIGINT NOT NULL CHECK (amount_usd_minor > 0),
  amount_ngn_minor BIGINT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  paypal_batch_id  TEXT UNIQUE,
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL,
  updated_at       TIMESTAMPTZ NOT NULL
);


CREATE INDEX withdrawals_due ON withdrawals (next_attempt_at) WHERE status = 'PENDING';


ALTER TABLE ledger_entries
  ADD COLUMN withdrawal_id TEXT REFERENCES withdrawals (id),
  ADD CONSTRAINT ledger_entries_withdrawal_once UNIQUE (withdrawal_id, type),
  DROP CONSTRAINT ledger_entries_type_check,
  ADD CONSTRAINT ledger_entries_type_check CHECK (type IN (
    'CREDIT', 'WITHDRAWAL', 'REVERSAL', 'WITHDRAWAL_RETURNED'
  ));


ALTER TABLE transaction_events
  DROP CONSTRAINT transaction_events_type_check,
  ADD CONSTRAINT transaction_events_type_check CHECK (type IN (
    'VAULT_LOCKED', 'VAULT_RELEASED', 'VOUCHER_SUBMITTED', 'VOUCHER_SETTLED',
    'VOUCHER_REJECTED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_COMPLETED', 'WITHDRAWAL_FAILED'
  ));

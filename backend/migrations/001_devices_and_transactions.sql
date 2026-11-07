CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  key_id       TEXT NOT NULL UNIQUE,
  public_key   TEXT NOT NULL UNIQUE,
  token_hash   TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  language     TEXT NOT NULL CHECK (language IN ('en', 'pcm', 'yo', 'ig', 'ha')),
  payout_email TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ
);




CREATE TABLE transaction_events (
  position            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  id                  TEXT NOT NULL UNIQUE,
  device_id           TEXT NOT NULL REFERENCES devices (id),
  type                TEXT NOT NULL CHECK (type IN (
    'VAULT_LOCKED', 'VAULT_RELEASED', 'VOUCHER_SUBMITTED', 'VOUCHER_SETTLED',
    'VOUCHER_REJECTED', 'WITHDRAWAL_REQUESTED', 'WITHDRAWAL_COMPLETED'
  )),
  amount_ngn_minor    BIGINT,
  amount_usd_minor    BIGINT,
  vault_id            TEXT,
  voucher_id          TEXT,
  paypal_reference_id TEXT,
  occurred_at         TIMESTAMPTZ NOT NULL
);



CREATE INDEX transaction_events_device_history
  ON transaction_events (device_id, position DESC);


CREATE FUNCTION reject_transaction_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transaction_events is append-only';
END;
$$ LANGUAGE plpgsql;


CREATE TRIGGER transaction_events_append_only
  BEFORE UPDATE OR DELETE ON transaction_events
  FOR EACH ROW EXECUTE FUNCTION reject_transaction_change();
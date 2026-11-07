CREATE TABLE vaults (
  id                      TEXT PRIMARY KEY,
  device_id               TEXT NOT NULL REFERENCES devices (id),
  status                  TEXT NOT NULL CHECK (status IN (
    'PENDING_APPROVAL', 'ACTIVE', 'SPEND_CLOSED', 'CLOSED', 'BLOCKED'
  )),
  amount_ngn_minor        BIGINT NOT NULL CHECK (amount_ngn_minor > 0),
  authorised_usd_minor    BIGINT NOT NULL CHECK (authorised_usd_minor > 0),
  fx_rate                 TEXT NOT NULL,
  duration_hours          INTEGER NOT NULL CHECK (duration_hours BETWEEN 1 AND 24),
  paypal_order_id         TEXT NOT NULL UNIQUE,
  paypal_authorization_id TEXT UNIQUE,
  spend_by                TIMESTAMPTZ,
  settle_by               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL
);


CREATE UNIQUE INDEX vaults_one_open_per_device
  ON vaults (device_id)
  WHERE status <> 'CLOSED';


CREATE TABLE idempotency_keys (
  device_id       TEXT NOT NULL REFERENCES devices (id),
  key             TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status INTEGER,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, key)
);

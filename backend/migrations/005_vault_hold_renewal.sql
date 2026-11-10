-- A vault now waits for its customer up to PayPal's 29-day hold, renewing the
-- authorisation each time its three-day honor period ends.
ALTER TABLE vaults ADD COLUMN honor_ends_at TIMESTAMPTZ;


CREATE INDEX vaults_due_for_reauthorization
  ON vaults (honor_ends_at)
  WHERE status IN ('ACTIVE', 'SPEND_CLOSED');

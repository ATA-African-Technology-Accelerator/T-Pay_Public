-- Money received offline goes on to the person's own PayPal by itself, in batches. People can turn
-- it off; it is on unless they do. Automatic payouts are marked so they are counted apart from the
-- withdrawals people make themselves.
ALTER TABLE devices ADD COLUMN auto_cash_out BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE withdrawals ADD COLUMN auto_cash_out BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ledger_entries ADD COLUMN auto_cash_out BOOLEAN NOT NULL DEFAULT FALSE;

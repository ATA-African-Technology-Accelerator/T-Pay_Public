-- Lock money from the Online wallet. The money is already collected into T-Pay's PayPal account,
-- so the vault needs no PayPal hold: the wallet is debited when the vault opens and whatever is not
-- spent goes back when it closes.
ALTER TABLE vaults
  ADD COLUMN funded_by TEXT NOT NULL DEFAULT 'PAYPAL' CHECK (funded_by IN ('PAYPAL', 'WALLET'));


-- One lock and one return per vault, enforced by the database, so a repeat can never take or
-- give the money twice.
ALTER TABLE ledger_entries
  ADD COLUMN vault_id TEXT REFERENCES vaults (id),
  ADD CONSTRAINT ledger_entries_vault_once UNIQUE (vault_id, type),
  DROP CONSTRAINT ledger_entries_type_check,
  ADD CONSTRAINT ledger_entries_type_check CHECK (type IN (
    'CREDIT', 'WITHDRAWAL', 'REVERSAL', 'WITHDRAWAL_RETURNED', 'DEPOSIT', 'PAYMENT_LINK',
    'VAULT_LOCK', 'VAULT_RETURN'
  ));

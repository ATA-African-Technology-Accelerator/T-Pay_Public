// Contract section 6: the app picks the words by code and never shows server text.
import { ApiRequestError } from '../adapters/api/httpApi';
import { t } from '../i18n';

export function apiMessage(e: unknown): string {
  if (!(e instanceof ApiRequestError)) return t.setupFailed;
  switch (e.code) {
    case 'NETWORK': return t.needsInternet;
    case 'ACTIVE_VAULT_EXISTS': return t.vaultExists;
    case 'ORDER_NOT_APPROVED': return t.notApproved;
    case 'VALIDATION_FAILED': return t.setupCheckDetails;
    case 'RATE_LIMITED': case 'PAYPAL_UNAVAILABLE': case 'IDEMPOTENCY_CONFLICT': return t.setupBusy;
    default: return t.setupFailed;
  }
}

export const isCode = (e: unknown, code: string) => e instanceof ApiRequestError && e.code === code;

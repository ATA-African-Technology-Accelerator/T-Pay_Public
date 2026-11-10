import { describe, expect, it } from 'vitest';
import { ERROR_HTTP_STATUS } from '@tpay/shared/contracts/errors';



describe('ERROR_HTTP_STATUS', () => {
  it('defines every contract error code with its status', () => {
    expect(ERROR_HTTP_STATUS).toEqual({
      VALIDATION_FAILED: 400,
      UNAUTHENTICATED: 401,
      DEVICE_REVOKED: 403,
      NOT_A_PARTY: 403,
      VAULT_NOT_FOUND: 404,
      VOUCHER_NOT_FOUND: 404,
      ROUTE_NOT_FOUND: 404,
      ACTIVE_VAULT_EXISTS: 409,
      ORDER_NOT_APPROVED: 409,
      IDEMPOTENCY_CONFLICT: 409,
      INVALID_SIGNATURE: 422,
      INVALID_CERTIFICATE: 422,
      VOUCHER_EXPIRED: 422,
      INSUFFICIENT_BALANCE: 422,
      RATE_LIMITED: 429,
      INTERNAL_SERVER_ERROR: 500,
      PAYPAL_UNAVAILABLE: 503,
      AI_UNAVAILABLE: 503,
    });
  });
});
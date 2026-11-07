import { z } from 'zod';
import { ApiError } from '../services/ApiError';




const MAX_VAULT_NGN_MINOR = 1_000_000_000;
const MAX_SPEND_HOURS = 24;

const language = z.enum(['en', 'pcm', 'yo', 'ig', 'ha']);
const displayName = z.string().trim().min(1).max(80);
const payoutEmail = z.string().email();


export const registerDeviceSchema = z
  .object({
    publicKey: z.string().min(1),
    displayName,
    language,
    payoutEmail: payoutEmail,
    proof: z.string().min(1),
  })
  .strict();

  
export const updateProfileSchema = z
  .object({
    displayName: displayName.optional(),
    language: language.optional(),
    payoutEmail: payoutEmail.optional(),
  })
  .strict();



export const listTransactionsQuerySchema = z
  .object({ since: z.string().regex(/^\d+$/).optional() })
  .strict();

  
  
export const createVaultSchema = z
  .object({
    amountNgnMinor: z.number().int().positive().max(MAX_VAULT_NGN_MINOR),
    durationHours: z.number().int().min(1).max(MAX_SPEND_HOURS),
  })
  .strict();


export const paypalReturnQuerySchema = z.object({
  vaultId: z.string().min(1),
  outcome: z.enum(['approved', 'cancelled']),
  token: z.string().optional(),
});


const envelope = <T extends z.ZodRawShape>(payload: T) =>
  z.object({ payload: z.object(payload).strict(), signature: z.string().min(1) }).strict();

const minorUnits = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const requiredText = z.string().min(1);
const instant = z.iso.datetime();

const voucherEnvelope = envelope({
  vaultId: requiredText,
  keyId: requiredText,
  deviceId: requiredText,
  sequence: z.number().int().positive(),
  amountNgnMinor: minorUnits.positive(),
  amountUsdMinor: minorUnits.positive(),
  fxRate: requiredText,
  payeeKeyId: requiredText,
  requestNonce: requiredText,
  issuedAt: instant,
  expiresAt: instant,
});

const vaultCertificateEnvelope = envelope({
  vaultId: requiredText,
  keyId: requiredText,
  authorisedUsdMinor: minorUnits,
  amountNgnMinor: minorUnits,
  fxRate: requiredText,
  spendBy: instant,
  settleBy: instant,
});

const receiptEnvelope = envelope({
  vaultId: requiredText,
  sequence: z.number().int().positive(),
  voucherHash: requiredText,
  merchantKeyId: requiredText,
  receivedAt: instant,
});

export const submitVoucherSchema = z
  .object({
    voucher: voucherEnvelope,
    vaultCertificate: vaultCertificateEnvelope,
    receipt: receiptEnvelope.optional(),
  })
  .strict();


export const meltVaultSchema = z
  .object({
    spendStatement: envelope({
      vaultId: requiredText,
      lastSequence: z.number().int().nonnegative(),
      totalIssuedUsdMinor: minorUnits,
      issuedAt: instant,
    }),
  })
  .strict();


export const listVouchersQuerySchema = z
  .object({
    since: z.string().regex(/^\d+$/).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();


export const withdrawSchema = z
  .object({ amountUsdMinor: minorUnits.positive() })
  .strict();


export const paypalWebhookSchema = z.looseObject({
  id: requiredText,
  event_type: requiredText,
  resource: z.record(z.string(), z.unknown()).default({}),
});


export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError('VALIDATION_FAILED', result.error.issues[0]?.message ?? 'Invalid request');
  }
  return result.data;
}
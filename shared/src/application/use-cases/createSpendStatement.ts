import { MESSAGE_PREFIX } from '../../contracts/messages';
import type {
  SignedEnvelope, SpendStatementPayload, VoucherPayload,
} from '../../contracts/messages';
import { signMessage } from '../../domain/signedMessages';
import { Result } from '../../shared/domain/Result';
import type { ISigner } from '../ports/crypto';
import type { IClock } from '../ports/system';





export const SPEND_STATEMENT_GAP = 'SPEND_STATEMENT_GAP';


export interface CreateSpendStatementInput {
  vaultId: string;
  // Every voucher this phone signed for the vault.
  issued: VoucherPayload[];
  customerPrivateKey: string;
}


// ACT-12. The customer declares everything it signed. The backend releases the
// hold only once sequences 1 to lastSequence have all finished and their total
// is settled, so a missing sequence would hold the money until settle-by.
export async function createSpendStatement(
  input: CreateSpendStatementInput,
  { signer, clock }: { signer: ISigner; clock: IClock },
): Promise<Result<SignedEnvelope<SpendStatementPayload>>> {
  const vouchers = input.issued.filter((voucher) => voucher.vaultId === input.vaultId);
  const sequences = vouchers.map((voucher) => voucher.sequence).sort((a, b) => a - b);

  if (new Set(sequences).size !== sequences.length || sequences.some((sequence, index) => sequence !== index + 1)) {
    return Result.fail(SPEND_STATEMENT_GAP);
  }

  const statement = await signMessage<SpendStatementPayload>(
    MESSAGE_PREFIX.SPEND_STATEMENT,
    {
      vaultId: input.vaultId,
      lastSequence: sequences.length,
      totalIssuedUsdMinor: vouchers.reduce((total, voucher) => total + voucher.amountUsdMinor, 0),
      issuedAt: clock.now().toISOString(),
    },
    input.customerPrivateKey,
    signer,
  );
  return Result.ok(statement);
}

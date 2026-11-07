import type { ISigner } from '../application/ports/crypto';
import type { SignedEnvelope } from '../contracts/messages';
import { signingInput } from './canonicalJson';




export async function signMessage<T extends object>(
  prefix: string,
  payload: T,
  privateKey: string,
  signer: ISigner,
): Promise<SignedEnvelope<T>> {
  const signature = await signer.sign(signingInput(prefix, payload), privateKey);
  return { payload, signature };
}

export function verifyMessage<T extends object>(
  prefix: string,
  message: SignedEnvelope<T>,
  publicKey: string,
  signer: ISigner,
): Promise<boolean> {
  return signer.verify(signingInput(prefix, message.payload), message.signature, publicKey);
}
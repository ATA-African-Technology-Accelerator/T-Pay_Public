import type { IClock, IRandom } from '@tpay/shared/application/ports/system';
import type { PayLinkResponse } from '@tpay/shared/contracts/api';
import type { Device, IWalletRepository } from './ports';




// 22 base64url characters are 132 bits: not guessable, and short enough to read out or type.
const TOKEN_LENGTH = 22;


export interface PayLinkDependencies {
  wallet: IWalletRepository;
  random: IRandom;
  clock: IClock;
  publicBaseUrl: string;
}


// One public link per account. Anyone who opens it can pay the account by PayPal.
export class PayLinks {
  constructor(private readonly dependencies: PayLinkDependencies) {}

  public async getOrCreate(device: Device): Promise<PayLinkResponse> {
    const { clock, publicBaseUrl, random, wallet } = this.dependencies;
    const token = await wallet.findOrCreatePayLink(device.id, random.nonce().slice(0, TOKEN_LENGTH), clock.now());
    return { url: `${publicBaseUrl}/pay/${token}` };
  }
}

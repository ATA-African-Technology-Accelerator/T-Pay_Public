import { ApiError } from '../../src/services/ApiError';
import type { AssistantModelRequest, IAssistantModel } from '../../src/services/ports';




export class FakeAssistantModel implements IAssistantModel {
  public readonly requests: AssistantModelRequest[] = [];
  public reply: unknown = {
    intent: 'CREATE_PAYMENT_REQUEST',
    amountNaira: 1000,
    itemName: null,
    transcript: 'Abeg collect one thousand',
    spokenReply: 'You wan collect one thousand naira?',
  };
  public unavailable = false;

  public async interpret(request: AssistantModelRequest): Promise<unknown> {
    this.requests.push(request);
    if (this.unavailable) {
      throw new ApiError('AI_UNAVAILABLE', 'The assistant could not be reached');
    }
    return this.reply;
  }
}

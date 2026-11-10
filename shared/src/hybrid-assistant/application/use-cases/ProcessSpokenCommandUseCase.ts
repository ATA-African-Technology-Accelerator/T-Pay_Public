import type { ISLMModelPort, ITextToSpeechPort } from '../ports/AssistantPorts';
import type { SupportedLanguage, ExecutionMode } from '../../domain/value-objects/VoiceIntent';
import { MultilingualVoiceService } from '../../domain/services/MultilingualVoiceService';
import { ProcessVoiceSaleUseCase } from '../../../resource-tracking/merchant/application/use-cases/ProcessVoiceSaleUseCase';
import { BulkImportVoiceInventoryUseCase } from '../../../resource-tracking/merchant/application/use-cases/BulkImportVoiceInventoryUseCase';
import { GenerateDailyReconciliationUseCase } from '../../../resource-tracking/merchant/application/use-cases/GenerateDailyReconciliationUseCase';
import { DeductBudgetExpenseUseCase } from '../../../resource-tracking/budget/application/use-cases/DeductBudgetExpenseUseCase';
import { CollectPassengerFaresUseCase } from '../../../resource-tracking/transit/application/use-cases/CollectPassengerFaresUseCase';
import { Result } from '../../../shared/domain/Result';

export interface SpokenCommandInputDTO {
  transcript: string;
  language?: SupportedLanguage;
  executionMode?: ExecutionMode;
}

export interface SpokenCommandResultDTO {
  intentType: string;
  executionMode: ExecutionMode;
  language: SupportedLanguage;
  rawConfirmation: string;
  localizedSpokenText: string;
  data?: any;
}

export class ProcessSpokenCommandUseCase {
  private slmModel: ISLMModelPort;
  private tts: ITextToSpeechPort;
  private merchantSaleUseCase: ProcessVoiceSaleUseCase;
  private bulkImportUseCase: BulkImportVoiceInventoryUseCase;
  private reconciliationUseCase: GenerateDailyReconciliationUseCase;
  private budgetUseCase: DeductBudgetExpenseUseCase;
  private transitUseCase: CollectPassengerFaresUseCase;

  constructor(
    slmModel: ISLMModelPort,
    tts: ITextToSpeechPort,
    merchantSaleUseCase: ProcessVoiceSaleUseCase,
    bulkImportUseCase: BulkImportVoiceInventoryUseCase,
    reconciliationUseCase: GenerateDailyReconciliationUseCase,
    budgetUseCase: DeductBudgetExpenseUseCase,
    transitUseCase: CollectPassengerFaresUseCase
  ) {
    this.slmModel = slmModel;
    this.tts = tts;
    this.merchantSaleUseCase = merchantSaleUseCase;
    this.bulkImportUseCase = bulkImportUseCase;
    this.reconciliationUseCase = reconciliationUseCase;
    this.budgetUseCase = budgetUseCase;
    this.transitUseCase = transitUseCase;
  }

  public async execute(input: SpokenCommandInputDTO): Promise<Result<SpokenCommandResultDTO>> {
    const lang = input.language || 'pidgin';
    const mode = input.executionMode || 'offline_slm';

    // 1. Parse intent via Local SLM
    const intent = await this.slmModel.parseSpokenIntent(input.transcript);

    let rawConfirmation = '';
    let resultData: any = null;

    // 2. Route to appropriate Bounded Context Use Case
    switch (intent.type) {
      case 'COLLECT_MERCHANT_PAYMENT': {
        const saleResult = await this.merchantSaleUseCase.execute({
          spokenQuery: input.transcript,
          matchedItemName: intent.parameters.itemName || 'coke',
          currencyAmount: intent.parameters.amount || 1000,
          paymentMethod: 'bluetooth_escrow',
        });
        if (saleResult.isFailure) return Result.fail(saleResult.error!);
        resultData = saleResult.getValue();
        rawConfirmation = resultData.spokenConfirmation;
        break;
      }

      case 'BULK_SETUP_INVENTORY': {
        const importResult = await this.bulkImportUseCase.execute({
          spokenTranscript: input.transcript,
        });
        if (importResult.isFailure) return Result.fail(importResult.error!);
        resultData = importResult.getValue();
        rawConfirmation = resultData.spreadsheetSummaryText;
        break;
      }

      case 'DEDUCT_BUDGET_EXPENSE': {
        const budgetResult = await this.budgetUseCase.execute({
          amount: intent.parameters.amount || 2000,
          itemDescription: intent.parameters.description || 'food',
        });
        if (budgetResult.isFailure) return Result.fail(budgetResult.error!);
        resultData = budgetResult.getValue();
        rawConfirmation = resultData.spokenConfirmation;
        break;
      }

      case 'COLLECT_TRANSIT_FARES': {
        const transitResult = await this.transitUseCase.execute();
        if (transitResult.isFailure) return Result.fail(transitResult.error!);
        resultData = transitResult.getValue();
        rawConfirmation = resultData.spokenDriverAlert;
        break;
      }

      case 'DAILY_RECONCILIATION': {
        const reconResult = await this.reconciliationUseCase.execute();
        if (reconResult.isFailure) return Result.fail(reconResult.error!);
        resultData = reconResult.getValue();
        rawConfirmation = resultData.readoutScript;
        break;
      }

      default: {
        rawConfirmation = `I heard: "${input.transcript}". Please try saying: "collect 1,000 for coke", "send 2k for spag", or "collect money from everybody".`;
      }
    }

    // 3. Localize speech readout into preferred regional language
    const localizedText = MultilingualVoiceService.translateResponse(rawConfirmation, lang);

    // 4. Audio Readout (Closing the literacy barrier)
    await this.tts.speak(localizedText, lang);

    return Result.ok({
      intentType: intent.type,
      executionMode: mode,
      language: lang,
      rawConfirmation,
      localizedSpokenText: localizedText,
      data: resultData,
    });
  }
}

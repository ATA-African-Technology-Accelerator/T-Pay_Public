// Repositories
import { LocalStorageEscrowRepository } from './escrow/infrastructure/repositories/LocalStorageEscrowRepository';
import { LocalStorageInventoryRepository } from './resource-tracking/merchant/infrastructure/repositories/LocalStorageInventoryRepository';
import { LocalStorageBudgetRepository } from './resource-tracking/budget/infrastructure/repositories/LocalStorageBudgetRepository';
import { LocalStorageTransitRepository } from './resource-tracking/transit/infrastructure/repositories/LocalStorageTransitRepository';

// Adapters
import { PayPalSdkGatewayAdapter } from './escrow/infrastructure/adapters/PayPalSdkGatewayAdapter';
import { BroadcastChannelProximityAdapter } from './escrow/infrastructure/adapters/BroadcastChannelProximityAdapter';
import { LocalSLMAdapter } from './hybrid-assistant/infrastructure/adapters/LocalSLMAdapter';
import { WebSpeechSynthesisAdapter } from './hybrid-assistant/infrastructure/adapters/WebSpeechSynthesisAdapter';

// Escrow Repositories & Use Cases
import { LocalStorageMarketVaultRepository } from './escrow/infrastructure/repositories/LocalStorageMarketVaultRepository';
import { CreateOfflineEscrowUseCase } from './escrow/application/use-cases/CreateOfflineEscrowUseCase';
import { SyncEscrowsToPayPalUseCase } from './escrow/application/use-cases/SyncEscrowsToPayPalUseCase';
import { LockMarketVaultUseCase } from './escrow/application/use-cases/LockMarketVaultUseCase';
import { MeltMarketVaultUseCase } from './escrow/application/use-cases/MeltMarketVaultUseCase';

// Merchant Use Cases
import { ProcessVoiceSaleUseCase } from './resource-tracking/merchant/application/use-cases/ProcessVoiceSaleUseCase';
import { BulkImportVoiceInventoryUseCase } from './resource-tracking/merchant/application/use-cases/BulkImportVoiceInventoryUseCase';
import { GenerateDailyReconciliationUseCase } from './resource-tracking/merchant/application/use-cases/GenerateDailyReconciliationUseCase';

// Budget Use Cases
import { DeductBudgetExpenseUseCase } from './resource-tracking/budget/application/use-cases/DeductBudgetExpenseUseCase';
import { ResolveCategoryAmbiguityUseCase } from './resource-tracking/budget/application/use-cases/ResolveCategoryAmbiguityUseCase';

// Transit Use Cases
import { CollectPassengerFaresUseCase } from './resource-tracking/transit/application/use-cases/CollectPassengerFaresUseCase';

// Hybrid Assistant Use Cases
import { ProcessSpokenCommandUseCase } from './hybrid-assistant/application/use-cases/ProcessSpokenCommandUseCase';

// Seed Initial Inventory Items
import { InventoryItem } from './resource-tracking/merchant/domain/InventoryItem';
import { Money } from './shared/domain/Money';
import { UniqueEntityId } from './shared/domain/Identifier';

/**
 * Dependency Injection Composition Root for T-Pay DDD Architecture
 */
export class TPayContainer {
  private static instance: TPayContainer;

  // Infrastructure
  public readonly escrowRepository: LocalStorageEscrowRepository;
  public readonly marketVaultRepository: LocalStorageMarketVaultRepository;
  public readonly inventoryRepository: LocalStorageInventoryRepository;
  public readonly budgetRepository: LocalStorageBudgetRepository;
  public readonly transitRepository: LocalStorageTransitRepository;

  public readonly payPalGateway: PayPalSdkGatewayAdapter;
  public readonly proximityTransport: BroadcastChannelProximityAdapter;
  public readonly slmModel: LocalSLMAdapter;
  public readonly speechSynthesizer: WebSpeechSynthesisAdapter;

  // Escrow Use Cases
  public readonly createOfflineEscrowUseCase: CreateOfflineEscrowUseCase;
  public readonly syncEscrowsToPayPalUseCase: SyncEscrowsToPayPalUseCase;
  public readonly lockMarketVaultUseCase: LockMarketVaultUseCase;
  public readonly meltMarketVaultUseCase: MeltMarketVaultUseCase;


  // Merchant Use Cases
  public readonly processVoiceSaleUseCase: ProcessVoiceSaleUseCase;
  public readonly bulkImportVoiceInventoryUseCase: BulkImportVoiceInventoryUseCase;
  public readonly generateDailyReconciliationUseCase: GenerateDailyReconciliationUseCase;

  // Budget Use Cases
  public readonly deductBudgetExpenseUseCase: DeductBudgetExpenseUseCase;
  public readonly resolveCategoryAmbiguityUseCase: ResolveCategoryAmbiguityUseCase;

  // Transit Use Cases
  public readonly collectPassengerFaresUseCase: CollectPassengerFaresUseCase;

  // Assistant Use Case
  public readonly processSpokenCommandUseCase: ProcessSpokenCommandUseCase;

  private constructor() {
    // 1. Repositories
    this.escrowRepository = new LocalStorageEscrowRepository();
    this.marketVaultRepository = new LocalStorageMarketVaultRepository();

    const initialMerchantItems: InventoryItem[] = [
      InventoryItem.create('Coke (50cl Pet)', 'Beverages', Money.create(500, 'NGN').getValue(), 42, 'bottle', 10, new UniqueEntityId('item-coke')).getValue(),
      InventoryItem.create('Maltina Can', 'Beverages', Money.create(600, 'NGN').getValue(), 56, 'can', 12, new UniqueEntityId('item-maltina')).getValue(),
      InventoryItem.create('Agege Sweet Bread', 'Bakery', Money.create(800, 'NGN').getValue(), 18, 'piece', 5, new UniqueEntityId('item-bread')).getValue(),
      InventoryItem.create('Peak Evaporated Milk', 'Dairy', Money.create(450, 'NGN').getValue(), 30, 'can', 8, new UniqueEntityId('item-milk')).getValue(),
      InventoryItem.create('Golden Penny Spaghetti', 'Dry Goods', Money.create(650, 'NGN').getValue(), 24, 'pack', 6, new UniqueEntityId('item-spag')).getValue(),
      InventoryItem.create('Indomie Hungryman Size', 'Dry Goods', Money.create(350, 'NGN').getValue(), 65, 'pack', 15, new UniqueEntityId('item-indomie')).getValue(),
    ];
    this.inventoryRepository = new LocalStorageInventoryRepository(initialMerchantItems);

    this.budgetRepository = new LocalStorageBudgetRepository();
    this.transitRepository = new LocalStorageTransitRepository();

    // 2. Adapters
    this.payPalGateway = new PayPalSdkGatewayAdapter();
    this.proximityTransport = new BroadcastChannelProximityAdapter();
    this.slmModel = new LocalSLMAdapter();
    this.speechSynthesizer = new WebSpeechSynthesisAdapter();

    // 3. Application Use Cases
    this.createOfflineEscrowUseCase = new CreateOfflineEscrowUseCase(
      this.escrowRepository,
      this.proximityTransport,
      this.payPalGateway
    );

    this.syncEscrowsToPayPalUseCase = new SyncEscrowsToPayPalUseCase(
      this.escrowRepository,
      this.payPalGateway
    );

    this.lockMarketVaultUseCase = new LockMarketVaultUseCase(this.marketVaultRepository);
    this.meltMarketVaultUseCase = new MeltMarketVaultUseCase(this.marketVaultRepository);

    this.processVoiceSaleUseCase = new ProcessVoiceSaleUseCase(this.inventoryRepository);
    this.bulkImportVoiceInventoryUseCase = new BulkImportVoiceInventoryUseCase(this.inventoryRepository);
    this.generateDailyReconciliationUseCase = new GenerateDailyReconciliationUseCase(this.inventoryRepository);

    this.deductBudgetExpenseUseCase = new DeductBudgetExpenseUseCase(this.budgetRepository);
    this.resolveCategoryAmbiguityUseCase = new ResolveCategoryAmbiguityUseCase(this.budgetRepository);

    this.collectPassengerFaresUseCase = new CollectPassengerFaresUseCase(
      this.transitRepository,
      this.proximityTransport
    );

    this.processSpokenCommandUseCase = new ProcessSpokenCommandUseCase(
      this.slmModel,
      this.speechSynthesizer,
      this.processVoiceSaleUseCase,
      this.bulkImportVoiceInventoryUseCase,
      this.generateDailyReconciliationUseCase,
      this.deductBudgetExpenseUseCase,
      this.collectPassengerFaresUseCase
    );
  }

  public static getInstance(): TPayContainer {
    if (!TPayContainer.instance) {
      TPayContainer.instance = new TPayContainer();
    }
    return TPayContainer.instance;
  }
}

export const container = TPayContainer.getInstance();


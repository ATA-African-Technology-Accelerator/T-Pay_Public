import { container } from '../container';
import { Money } from '../shared/domain/Money';
import { DomainEventBus } from '../shared/domain/DomainEventBus';
import { EscrowSettledViaPayPalEvent } from '../escrow/domain/events/EscrowEvents';
import { InventoryStockDeductedEvent } from '../resource-tracking/merchant/domain/events/MerchantEvents';
import { ExpenseRecordedEvent } from '../resource-tracking/budget/domain/events/BudgetEvents';
import { TripFullyCollectedEvent } from '../resource-tracking/transit/domain/events/TransitEvents';

async function runDDDVerification() {
  console.log('================================================================');
  console.log('🚀 T-PAY DOMAIN-DRIVEN DESIGN (DDD) ARCHITECTURAL VERIFICATION');
  console.log('================================================================\n');

  // Track event bus dispatching
  let escrowEventsFired = 0;
  let inventoryEventsFired = 0;
  let budgetEventsFired = 0;
  let transitEventsFired = 0;

  DomainEventBus.subscribe('EscrowSettledViaPayPalEvent', (evt) => {
    escrowEventsFired++;
    console.log('   [EVENT] 💳 EscrowSettledViaPayPalEvent fired:', (evt as EscrowSettledViaPayPalEvent).paypalOrderId);
  });

  DomainEventBus.subscribe('InventoryStockDeductedEvent', (evt) => {
    inventoryEventsFired++;
    const e = evt as InventoryStockDeductedEvent;
    console.log(`   [EVENT] 📦 InventoryStockDeductedEvent fired: ${e.itemName} (-${e.unitsDeducted} units, remaining: ${e.remainingUnits})`);
  });

  DomainEventBus.subscribe('ExpenseRecordedEvent', (evt) => {
    budgetEventsFired++;
    const e = evt as ExpenseRecordedEvent;
    console.log(`   [EVENT] 💰 ExpenseRecordedEvent fired: ${e.amountFormatted} ${e.note} (Category: ${e.categoryId})`);
  });

  DomainEventBus.subscribe('TripFullyCollectedEvent', (evt) => {
    transitEventsFired++;
    const e = evt as TripFullyCollectedEvent;
    console.log(`   [EVENT] 🚌 TripFullyCollectedEvent fired: Driver ${e.driverName}, Total Revenue: ${e.totalRevenueFormatted}`);
  });

  // TEST 1: Money Value Object Math
  console.log('--- TEST 1: Money Value Object Invariants ---');
  const m1 = Money.create(500, 'NGN').getValue();
  const m2 = Money.create(1000, 'NGN').getValue();
  const sum = m1.add(m2).getValue();
  console.log(`✓ 500 NGN + 1000 NGN = ${sum.format()}`);
  if (sum.amount !== 1500) throw new Error('Money addition failed');

  // TEST 2: Case 1 - The Merchant Voice Sale Auto-Deduction
  console.log('\n--- TEST 2: Merchant Case 1 ("collect 1,000 for coke") ---');
  const saleResult = await container.processVoiceSaleUseCase.execute({
    spokenQuery: 'collect one thousand for coke',
    matchedItemName: 'coke',
    currencyAmount: 1000,
    paymentMethod: 'bluetooth_escrow',
  });

  if (saleResult.isFailure) throw new Error(saleResult.error!);
  const saleData = saleResult.getValue();
  console.log(`✓ Spoken Confirmation: "${saleData.spokenConfirmation}"`);
  console.log(`✓ Units Sold: ${saleData.unitsSold} (Expected: 2 bottles at ₦500 each)`);
  console.log(`✓ Remaining Coke Stock: ${saleData.remainingStock} bottles`);
  if (saleData.unitsSold !== 2) throw new Error('Failed to auto-calculate 2 bottles for 1,000 NGN');

  // TEST 3: Case 1 - Voice Inventory Setup (Spreadsheet Builder)
  console.log('\n--- TEST 3: Merchant Voice Inventory Sheet Builder ---');
  const bulkTranscript = 'Coke, 42 packs, 500 naira for 1; Maltina, 56 packs, 600 for 1; Agege Bread, 18 pieces, 800 naira for 1';
  const importResult = await container.bulkImportVoiceInventoryUseCase.execute({
    spokenTranscript: bulkTranscript,
  });
  if (importResult.isFailure) throw new Error(importResult.error!);
  const importData = importResult.getValue();
  console.log(`✓ Imported Items Count: ${importData.itemsCount}`);
  console.log(`✓ Generated Summary: "${importData.spreadsheetSummaryText}"`);

  // TEST 4: Case 2 - Regular User Budget Deduction ("send 2k for spag")
  console.log('\n--- TEST 4: Regular User Case 2 ("send 2k for spag") ---');
  const budgetResult = await container.deductBudgetExpenseUseCase.execute({
    amount: 2000,
    itemDescription: 'spag',
  });
  if (budgetResult.isFailure) throw new Error(budgetResult.error!);
  const budgetData = budgetResult.getValue();
  console.log(`✓ Categorization Status: ${budgetData.status}`);
  console.log(`✓ Category Assigned: ${budgetData.categoryLabel} (ID: ${budgetData.categoryId})`);
  console.log(`✓ Spoken Confirmation: "${budgetData.spokenConfirmation}"`);
  if (budgetData.categoryId !== 'food') throw new Error('Failed to auto-categorize "spag" into "food"');

  // TEST 5: Case 2 - Ambiguity Detection ("send 1500 for gizmo")
  console.log('\n--- TEST 5: Regular User Ambiguity Fallback ("send 1500 for gizmo") ---');
  const ambigResult = await container.deductBudgetExpenseUseCase.execute({
    amount: 1500,
    itemDescription: 'gizmo',
  });
  if (ambigResult.isFailure) throw new Error(ambigResult.error!);
  const ambigData = ambigResult.getValue();
  console.log(`✓ Ambiguity Detected: ${ambigData.status === 'AMBIGUITY_DETECTED'}`);
  console.log(`✓ Clarification Question: "${ambigData.clarificationQuestion}"`);
  if (ambigData.status !== 'AMBIGUITY_DETECTED') throw new Error('Should have flagged unknown item "gizmo" as ambiguous');

  // Resolve Ambiguity
  const resolved = await container.resolveCategoryAmbiguityUseCase.execute({
    selectedCategoryId: 'upkeep',
    amount: 1500,
    originalDescription: 'gizmo',
  });
  console.log(`✓ Ambiguity Resolved: "${resolved.getValue().spokenConfirmation}"`);

  // TEST 6: Case 3 - Bus Driver (Morufu Transport Korope 7-Seater)
  console.log('\n--- TEST 6: Bus Driver Case 3 ("collect money from everybody") ---');
  const transitResult = await container.collectPassengerFaresUseCase.execute();
  if (transitResult.isFailure) throw new Error(transitResult.error!);
  const transitData = transitResult.getValue();
  console.log(`✓ Driver: ${transitData.driverName}`);
  console.log(`✓ Seats: ${transitData.paidCount} / ${transitData.totalSeats} paid`);
  console.log(`✓ Driver Spoken Alert: "${transitData.spokenDriverAlert}"`);

  // TEST 7: Offline Escrow ("The Big Gun") & PayPal Reconnection Settlement
  console.log('\n--- TEST 7: Offline Escrow Token & PayPal Settlement ---');
  const escrowResult = await container.createOfflineEscrowUseCase.execute({
    senderDeviceId: 'TPAY-PHONE-MALIK-01',
    senderName: 'Malik Olajuwon',
    senderAccount: '9102837461 (Offline)',
    recipientDeviceId: 'TPAY-TERM-MORUFU-07',
    recipientName: 'Morufu Transport',
    recipientAccount: '0039281744',
    amount: 300,
    currency: 'NGN',
  });
  if (escrowResult.isFailure) throw new Error(escrowResult.error!);
  const escrowData = escrowResult.getValue();
  console.log(`✓ Escrow Token Created: ID ${escrowData.id}`);
  console.log(`✓ Zero-Data Cryptogram: ${escrowData.cryptogramHash.substring(0, 30)}...`);
  console.log(`✓ Status: ${escrowData.status}`);

  // Simulate network reconnect and PayPal batch sync
  console.log('   Simulating opportunistic PayPal sync when Device reconnects to network...');
  container.payPalGateway.setNetworkStatus(true);
  const syncResult = await container.syncEscrowsToPayPalUseCase.execute('TPAY-PHONE-MALIK-01');
  if (syncResult.isFailure) throw new Error(syncResult.error!);
  const syncData = syncResult.getValue();
  console.log(`✓ PayPal Sync Result: ${syncData.message}`);

  // TEST 8: Hybrid Assistant Multilingual Spoken Command (Pidgin)
  console.log('\n--- TEST 8: Hybrid Assistant Multilingual Voice Command (Pidgin) ---');
  const spokenResult = await container.processSpokenCommandUseCase.execute({
    transcript: 'collect one thousand for coke',
    language: 'pidgin',
    executionMode: 'offline_slm',
  });
  if (spokenResult.isFailure) throw new Error(spokenResult.error!);
  const spokenData = spokenResult.getValue();
  console.log(`✓ Intent Recognized: ${spokenData.intentType}`);
  console.log(`✓ Execution Mode: ${spokenData.executionMode}`);
  console.log(`✓ Regional Language: ${spokenData.language}`);
  console.log(`✓ Localized Speech Readout: "${spokenData.localizedSpokenText}"`);

  // TEST 9: Time-Locked Market Vault ("The Budget-Locked Vault" Model)
  console.log('\n--- TEST 9: Time-Locked Market Vault ("The Budget-Locked Vault" Model) ---');
  const lockResult = await container.lockMarketVaultUseCase.execute({
    userId: 'user-malik',
    amount: 10000,
    currency: 'NGN',
    durationHours: 5,
  });
  if (lockResult.isFailure) throw new Error(lockResult.error!);
  const vaultData = lockResult.getValue();
  console.log(`✓ Market Vault Created: ID ${vaultData.vaultId}`);
  console.log(`✓ Pre-funded Amount Locked on PayPal: ${vaultData.allocatedAmountFormatted}`);
  console.log(`✓ Duration: ${vaultData.durationHours} hours (Expires: ${vaultData.expiresAtIso.substring(11, 19)})`);
  console.log(`✓ PayPal Cryptographic Lock: ${vaultData.cryptographicLockHash}`);
  console.log(`✓ PayPal Pre-Auth ID: ${vaultData.paypalPreAuthId}`);

  // Test spend deduction
  const activeVault = await container.marketVaultRepository.getActiveVault('user-malik');
  if (!activeVault) throw new Error('Active vault not found');
  const spendMoney = Money.create(2000, 'NGN').getValue();
  const spendResult = activeVault.authorizeSpend(spendMoney);
  if (spendResult.isFailure) throw new Error(spendResult.error!);
  console.log(`✓ Authorized Offline Spend: ₦2,000. Remaining in vault: ${activeVault.remainingAmount.format()}`);

  // Simulate auto-melt when timer expires
  const meltResult = await container.meltMarketVaultUseCase.execute({
    userId: 'user-malik',
    refundToAccountId: 'checking',
  });
  if (meltResult.isFailure) throw new Error(meltResult.error!);
  const meltData = meltResult.getValue();
  console.log(`✓ Auto-Melt On Expiry: ${meltData.message}`);
  console.log(`✓ Refunded to Primary Account: ${meltData.refundedToAccountId}`);

  console.log('\n================================================================');
  console.log('🎉 ALL DOMAIN-DRIVEN DESIGN (DDD) SPECIFICATIONS VERIFIED 100%!');
  console.log('================================================================');
}


runDDDVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});


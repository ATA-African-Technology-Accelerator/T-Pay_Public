import { Router } from 'express';
import { EscrowController } from '../controllers/escrow.controller';
import { VaultController } from '../controllers/vault.controller';
import { InventoryController } from '../controllers/inventory.controller';
import { BudgetController } from '../controllers/budget.controller';
import { TransitController, AssistantController } from '../controllers/transit.controller';

export const apiRouter = Router();

// Health Check
apiRouter.get('/health', (_req, res) => {
  res.json({
    status: 'online',
    system: 'T-Pay Backend REST API',
    architecture: 'Clean Domain-Driven Design (DDD)',
    paypalIntegration: 'Active Orders v2',
    timestamp: new Date().toISOString(),
  });
});

// Offline Escrow & PayPal Settlement
apiRouter.post('/escrow/create', EscrowController.createEscrow);
apiRouter.post('/escrow/sync', EscrowController.syncEscrow);
apiRouter.get('/escrow/tokens', EscrowController.getTokens);

// Time-Locked Market Vault
apiRouter.post('/vault/lock', VaultController.lockVault);
apiRouter.post('/vault/melt', VaultController.meltVault);
apiRouter.get('/vault/status/:userId?', VaultController.getActiveVault);

// Merchant Inventory & Voice Sales (Case 1)
apiRouter.get('/inventory', InventoryController.getInventory);
apiRouter.post('/inventory/voice-sale', InventoryController.processVoiceSale);
apiRouter.post('/inventory/bulk-import', InventoryController.bulkImport);
apiRouter.get('/inventory/reconciliation', InventoryController.getReconciliation);

// Personal Budget & Categorization (Case 2)
apiRouter.get('/budget/plan', BudgetController.getPlan);
apiRouter.post('/budget/deduct', BudgetController.deductExpense);
apiRouter.post('/budget/resolve-ambiguity', BudgetController.resolveAmbiguity);

// Transit & Korope Fleet (Case 3)
apiRouter.get('/transit/trip', TransitController.getActiveTrip);
apiRouter.post('/transit/collect-fares', TransitController.collectFares);

// Hybrid AI Voice Assistant
apiRouter.post('/assistant/command', AssistantController.processCommand);


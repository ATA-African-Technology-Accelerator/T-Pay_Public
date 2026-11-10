import { InventoryItem } from '../InventoryItem';
import { Money } from '../../../../shared/domain/Money';
import type { PackagingUnit } from '../value-objects/StockQuantity';
import { Result } from '../../../../shared/domain/Result';

export interface ParsedSpokenItem {
  name: string;
  quantity: number;
  unitType: PackagingUnit;
  unitPrice: number;
  category: string;
}

/**
 * Domain Service for parsing spoken/natural language inventory entries into structured items.
 * Example input: "Coke, 42 packs, 500 naira for 1; Maltina, 56 packs, 600 for 1; Agege Bread, 18 pieces, 800 naira for 1"
 */
export class SpokenInventoryParser {
  public static parse(speechTranscript: string): Result<ParsedSpokenItem[]> {
    if (!speechTranscript || speechTranscript.trim().length === 0) {
      return Result.fail<ParsedSpokenItem[]>('Spoken transcript cannot be empty');
    }

    const items: ParsedSpokenItem[] = [];
    // Split by semicolons, newlines, or conjunctions like "and", "then"
    const clauses = speechTranscript
      .split(/;|\n|\band\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const clause of clauses) {
      const parsed = this.parseClause(clause);
      if (parsed) {
        items.push(parsed);
      }
    }

    if (items.length === 0) {
      return Result.fail<ParsedSpokenItem[]>('Could not parse any inventory items from the spoken phrase');
    }

    return Result.ok<ParsedSpokenItem[]>(items);
  }

  private static parseClause(clause: string): ParsedSpokenItem | null {
    // Regex matching e.g.: "Coke, 42 packs, 500 naira for 1" or "Maltina 56 cans at 600 each"
    // Capture: 1: Name, 2: Qty, 3: Unit, 4: Price
    const pattern = /([a-zA-Z\s]+?)[,:\s]+?(\d+)\s*(packs?|bottles?|cans?|pieces?|bags?|cartons?)?[,\s]+?(?:(?:naira|ngn|₦)?\s*(\d+)|(\d+)\s*(?:naira|ngn|₦)?)\s*(?:for\s*1|each|per\s*one)?/i;
    const match = clause.match(pattern);

    if (match) {
      const rawName = match[1].trim();
      const rawQty = parseInt(match[2], 10);
      let rawUnit = (match[3] || 'piece').toLowerCase() as PackagingUnit;
      if (rawUnit.endsWith('s')) rawUnit = rawUnit.slice(0, -1) as PackagingUnit;
      const rawPrice = parseInt(match[4] || match[5], 10);

      if (rawName && !isNaN(rawQty) && !isNaN(rawPrice)) {
        return {
          name: rawName,
          quantity: rawQty,
          unitType: rawUnit,
          unitPrice: rawPrice,
          category: this.inferCategory(rawName),
        };
      }
    }

    // Fallback simple comma parser: "Coke, 42, 500"
    const parts = clause.split(',').map((p) => p.trim());
    if (parts.length >= 3) {
      const name = parts[0];
      const qty = parseInt(parts[1].replace(/[^\d]/g, ''), 10);
      const price = parseInt(parts[2].replace(/[^\d]/g, ''), 10);
      if (name && !isNaN(qty) && !isNaN(price)) {
        return {
          name,
          quantity: qty,
          unitType: 'piece',
          unitPrice: price,
          category: this.inferCategory(name),
        };
      }
    }

    return null;
  }

  private static inferCategory(name: string): string {
    const lower = name.toLowerCase();
    if (lower.includes('coke') || lower.includes('maltina') || lower.includes('fanta') || lower.includes('water') || lower.includes('drink')) {
      return 'Beverages';
    }
    if (lower.includes('bread') || lower.includes('cake') || lower.includes('biscuit')) {
      return 'Bakery';
    }
    if (lower.includes('spag') || lower.includes('indomie') || lower.includes('noodle') || lower.includes('rice')) {
      return 'Dry Goods';
    }
    if (lower.includes('milk') || lower.includes('yoghurt') || lower.includes('cheese')) {
      return 'Dairy';
    }
    return 'General';
  }
}

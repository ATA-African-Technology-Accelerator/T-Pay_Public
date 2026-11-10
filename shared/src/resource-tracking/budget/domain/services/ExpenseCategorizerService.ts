export interface CategorizationResult {
  isResolved: boolean;
  categoryId?: 'food' | 'transport' | 'upkeep' | 'other';
  note: string;
  clarificationQuestion?: string;
  candidateCategories?: { id: string; label: string }[];
}

/**
 * Domain Service for classifying freeform conversational expense items into budget categories.
 * Handles Nigerian cultural terms (spag, danfo, korope, garri, gala, etc.) and triggers clarification.
 */
export class ExpenseCategorizerService {
  private static FOOD_KEYWORDS = [
    'spag', 'spaghetti', 'rice', 'indomie', 'noodles', 'bread', 'food', 'groceries',
    'garri', 'soup', 'meat', 'fish', 'coke', 'malt', 'dinner', 'lunch', 'breakfast',
    'yam', 'beans', 'vegetables', 'pepper', 'stew'
  ];

  private static TRANSPORT_KEYWORDS = [
    'transport', 'korope', 'danfo', 'brt', 'bus', 'fuel', 'petrol', 'diesel',
    'uber', 'bolt', 'keke', 'okada', 'fare', 'toll', 'ferry', 'train', 'cab'
  ];

  private static UPKEEP_KEYWORDS = [
    'upkeep', 'haircut', 'salon', 'barber', 'soap', 'detergent', 'toothpaste',
    'cream', 'perfume', 'clothes', 'laundry', 'data', 'airtime', 'barbing', 'skincare'
  ];

  public static categorize(rawQuery: string): CategorizationResult {
    const query = rawQuery.toLowerCase().trim();

    // Direct category matches
    if (query.includes('food') || this.FOOD_KEYWORDS.some((kw) => query.includes(kw))) {
      return {
        isResolved: true,
        categoryId: 'food',
        note: `for ${rawQuery}`,
      };
    }

    if (query.includes('transport') || this.TRANSPORT_KEYWORDS.some((kw) => query.includes(kw))) {
      return {
        isResolved: true,
        categoryId: 'transport',
        note: `for ${rawQuery}`,
      };
    }

    if (query.includes('upkeep') || this.UPKEEP_KEYWORDS.some((kw) => query.includes(kw))) {
      return {
        isResolved: true,
        categoryId: 'upkeep',
        note: `for ${rawQuery}`,
      };
    }

    // Unrecognized item requires domain clarification
    return {
      isResolved: false,
      note: rawQuery,
      clarificationQuestion: `Does "${rawQuery}" fall under food, transport, or upkeep?`,
      candidateCategories: [
        { id: 'food', label: 'Food & Groceries' },
        { id: 'transport', label: 'Transportation' },
        { id: 'upkeep', label: 'Upkeep & Personal' },
      ],
    };
  }
}


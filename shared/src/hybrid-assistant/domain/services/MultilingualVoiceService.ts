import type { SupportedLanguage } from '../value-objects/VoiceIntent';

export class MultilingualVoiceService {
  public static translateResponse(
    englishText: string,
    language: SupportedLanguage
  ): string {
    if (language === 'en') return englishText;

    // Nigerian Pidgin translations
    if (language === 'pidgin') {
      return englishText
        .replace(/Sold (\d+) bottles? of Coke for ₦1,000/gi, 'I don sell $1 bottle of Coke for ₦1,000')
        .replace(/Remaining in stock: (\d+)/gi, 'E remain $1 for store')
        .replace(/Deducted ₦(\d+[\d,]*) from your Food & Groceries budget/gi, 'I don remove ₦$1 from your Chop-chop budget')
        .replace(/All (\d+) passengers have paid/gi, 'All $1 passenger don pay their money')
        .replace(/passengers have paid\. You have (\d+) seats? left/gi, 'passengers don pay. E remain $1 seat')
        .replace(/Recorded (\d+) items in your inventory sheet/gi, 'I don write down $1 items for your inventory book');
    }

    // Yoruba translations
    if (language === 'yoruba') {
      return englishText
        .replace(/Sold (\d+) bottles? of Coke for ₦1,000/gi, 'Mo ti ta igo Kooki $1 fun ₦1,000')
        .replace(/Remaining in stock: (\d+)/gi, 'O ku $1 ninu ile-itaja')
        .replace(/All (\d+) passengers have paid/gi, 'Gbogbo ero $1 ti san owo won');
    }

    // Igbo translations
    if (language === 'igbo') {
      return englishText
        .replace(/Sold (\d+) bottles? of Coke for ₦1,000/gi, 'E rerela m karama Coke $1 na ₦1,000')
        .replace(/Remaining in stock: (\d+)/gi, 'O fọdụrụ $1 n’ụlọ ahịa')
        .replace(/All (\d+) passengers have paid/gi, 'Ndị njem niile akwụọla ego');
    }

    // Hausa translations
    if (language === 'hausa') {
      return englishText
        .replace(/Sold (\d+) bottles? of Coke for ₦1,000/gi, 'An sayar da kwalaben Coke $1 akan ₦1,000')
        .replace(/Remaining in stock: (\d+)/gi, 'Ya rage $1 a shago');
    }

    return englishText;
  }
}

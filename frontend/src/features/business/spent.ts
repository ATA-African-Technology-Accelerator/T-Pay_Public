import type { Entry } from '../../state/appState';

/** What went out this month: payments the business made. Refused ones never moved money. */
export function spentThisMonth(history: Entry[], now = new Date()): number {
  return history
    .filter(e => e.dir === 'out' && e.status !== 'refused' && sameMonth(new Date(e.at), now))
    .reduce((sum, e) => sum + e.amount, 0);
}

const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

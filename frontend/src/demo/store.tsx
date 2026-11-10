// Sample data so the design can be walked through. No real money, signing or sync happens here.
// The real rules stay in shared/ and replace this file when the screens are wired up.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Status = 'paid' | 'locked' | 'pending' | 'sent' | 'refused' | 'blocked';
export type Dir = 'in' | 'out' | 'lock';
export type Entry = { id: string; who: string; amount: number; dir: Dir; status: Status; when: string; ref: string; capture?: string };
export type Wallet = 'active' | 'offline';
export type Contact = { name: string; number: string };

const SELLER = 'Mama Nkechi Provisions';
const now = () => 'Just now';
export const SPENT = 6000;
export const DEMO_RATE = 1500;
// Stands in for the network so the screens already handle waiting. It leaves with this file.
const settle = () => new Promise<void>(r => setTimeout(r, 900));

type Store = {
  name: string; number: string; contacts: Contact[]; setName(n: string): void; payout: string; setPayout(e: string): void; seller: string;
  wallet: Wallet; setWallet(w: Wallet): void; hidden: boolean; toggleHidden(): void;
  ready: boolean; active: number; locked: number; left: number; pending: number; incoming: number; paidIn: number; closing: boolean;
  history: Entry[]; blocking?: Entry;
  find(number: string): Promise<Contact | undefined>; send(n: number, to: Contact): Promise<string>; lock(n: number): Promise<void>; pay(n: number): void; receive(n: number): void; melt(): Promise<void>;
};

const CONTACTS: Contact[] = [
  { name: SELLER, number: '8034567890' }, { name: 'Iya Bose Foods', number: '8023456789' }, { name: 'Emeka Okafor', number: '8045678901' },
];

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState('Ada');
  const [payout, setPayout] = useState('ada-sandbox@example.com');
  const [wallet, setWallet] = useState<Wallet>('offline');
  const [hidden, setHidden] = useState(false);
  const [base, setBase] = useState(30000);
  const [locked, setLocked] = useState(25000);
  const [closing, setClosing] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { settle().then(() => setReady(true)); }, []);
  const [history, setHistory] = useState<Entry[]>([
    { id: 'd', who: 'Iya Bose Foods', amount: 1800, dir: 'out', status: 'pending', when: '8-Nov-2026  12:56 PM', ref: 'vch_458' },
    { id: 'e', who: 'Customer Bisi', amount: 1200, dir: 'in', status: 'pending', when: '8-Nov-2026  12:40 PM', ref: 'vch_461' },
    { id: 'a', who: SELLER, amount: 1500, dir: 'out', status: 'paid', when: '8-Nov-2026  11:02 AM', ref: 'vch_457', capture: 'SANDBOX-CAPTURE' },
    { id: 'c', who: 'Customer Musa', amount: 12000, dir: 'in', status: 'paid', when: '8-Nov-2026  10:20 AM', ref: 'vch_460', capture: 'SANDBOX-CAPTURE' },
    { id: 'l', who: 'Money locked', amount: 25000, dir: 'lock', status: 'locked', when: '7-Nov-2026  9:30 AM', ref: 'vlt_123' },
    { id: 'f', who: 'Customer Ngozi', amount: 6500, dir: 'in', status: 'paid', when: '7-Nov-2026  3:45 PM', ref: 'vch_459', capture: 'SANDBOX-CAPTURE' },
    { id: 'b', who: 'Baba Tunde Fabrics', amount: 500, dir: 'out', status: 'refused', when: '6-Nov-2026  4:10 PM', ref: 'vch_456' },
  ]);
  const add = (e: Omit<Entry, 'id' | 'when'>) => setHistory(h => [{ ...e, id: String(Date.now()), when: now() }, ...h]);

  const value = useMemo<Store>(() => {
    const sum = (f: (e: Entry) => boolean) => history.filter(f).reduce((a, e) => a + e.amount, 0);
    const pending = sum(e => e.dir === 'out' && e.status === 'pending');
    const incoming = sum(e => e.dir === 'in' && e.status === 'pending');
    const paidIn = sum(e => e.dir === 'in' && e.status === 'paid');
    return {
      name, number: '8012345678', contacts: CONTACTS, setName, payout, setPayout, seller: SELLER,
      wallet, setWallet, hidden, toggleHidden: () => setHidden(x => !x),
      ready, active: base + paidIn, locked, left: Math.max(0, locked - pending), pending, incoming, paidIn, closing,
      history, blocking: history.find(e => e.dir === 'out' && e.status === 'pending'),
      find: async number => { await settle(); return CONTACTS.find(c => c.number === number); },
      send: async (n, to) => {
        await settle();
        const id = String(Date.now());
        setBase(b => b - n);
        setHistory(h => [{ id, who: to.name, amount: n, dir: 'out', status: 'paid', when: now(), ref: `txn_${id}` }, ...h]);
        return id;
      },
      lock: async n => {
        await settle();
        setLocked(l => l + n); setBase(b => b - n); setClosing(false);
        add({ who: 'Money locked', amount: n, dir: 'lock', status: 'locked', ref: `vlt_${Date.now()}` });
      },
      pay: n => add({ who: SELLER, amount: n, dir: 'out', status: 'pending', ref: `vch_${Date.now()}` }),
      receive: n => add({ who: 'Customer', amount: n, dir: 'in', status: 'pending', ref: `vch_${Date.now()}` }),
      // Unspent money returns now. Money reserved for vouchers stays held until they settle.
      melt: async () => { await settle(); setBase(b => b + Math.max(0, locked - pending)); setLocked(pending); setClosing(pending > 0); },
    };
  }, [name, payout, wallet, hidden, base, locked, closing, ready, history]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore needs StoreProvider');
  return s;
}

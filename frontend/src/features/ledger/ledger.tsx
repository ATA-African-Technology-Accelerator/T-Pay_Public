import React, { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Pressable, Share, StyleSheet, TextInput, View } from 'react-native';
import { AlertCircle, Check, Copy, Link2, Share2 } from 'lucide-react-native';
import type { LedgerEntry } from '@tpay/shared/contracts/api';
import { color, icon, motion, radius, space, touch, type } from '../../theme/tokens';
import { convertNgnToUsd, convertUsdToNgn } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';
import { Keypad } from '../../components/keypad';
import { ConfirmPin } from '../onboarding/lock';
import { Button, HearIt, OfflineTag, Panel, Rise, T, money, sayNaira, usd, when } from '../../components/ui';
import { CurvedHeader, Screen, Section } from '../../components/shell';
import { Line } from '../../components/rows';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { apiMessage, isCode } from '../errors';
import { refreshWallet } from '../../sync/syncCoordinator';
import { api } from '../../composition';
import { withSession } from '../../session/guard';
import { withdraw } from './walletActivities';

const word = (e: LedgerEntry) => ({ CREDIT: t.ledgerCredit, PAYMENT_LINK: t.ledgerPaymentLink, DEPOSIT: t.ledgerDeposit, WITHDRAWAL: t.ledgerWithdrawal, REVERSAL: t.ledgerReversal, WITHDRAWAL_RETURNED: t.ledgerReturned, VAULT_LOCK: t.ledgerVaultLock, VAULT_RETURN: t.ledgerVaultReturn })[e.type];
const out = (e: LedgerEntry) => e.type === 'WITHDRAWAL' || e.type === 'REVERSAL' || e.type === 'VAULT_LOCK';

/** Anyone with the link can pay this account by PayPal. The link is the same every time. */
function PayLinkCard() {
  const { name, online } = useApp();
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fetchLink = async () => {
    setProblem(null);
    try { return (await withSession(() => api.getPayLink())).url; }
    catch { setProblem(t.payLinkFailed); return null; }
  };
  const share = async () => { const url = await fetchLink(); if (url) await Share.share({ message: `${t.payLinkMessage(name)} ${url}` }).catch(() => undefined); };
  const copy = async () => {
    const url = await fetchLink();
    if (!url) return;
    await Clipboard.setStringAsync(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <Panel>
      <View style={s.linkHead}>
        <Link2 size={icon.md} color={color.blue} strokeWidth={1.8} />
        <View style={{ flex: 1 }}>
          <T v="heading">{t.payLinkTitle}</T>
          <T v="small" c={color.muted}>{t.payLinkNote}</T>
        </View>
      </View>
      {problem && <T v="small" c={color.coral} accessibilityLiveRegion="polite">{problem}</T>}
      <View style={s.chips}>
        <Button style={{ flex: 1 }} kind="soft" label={t.payLinkShare} disabled={!online} icon={<Share2 size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={() => { void share(); }} />
        <Button style={{ flex: 1 }} kind="soft" label={copied ? t.copied : t.payLinkCopy} disabled={!online} icon={copied ? <Check size={icon.md} color={color.green} strokeWidth={2} /> : <Copy size={icon.md} color={color.text} strokeWidth={1.8} />} onPress={() => { void copy(); }} />
      </View>
    </Panel>
  );
}

/** ACT-13. Collected money, each credit linked to its PayPal capture (FR-40). */
export function Ledger() {
  const nav = useNav();
  const { active, online } = useApp();
  useEffect(() => { if (online) void refreshWallet().catch(() => undefined); }, []);
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.walletActive} />} footer={<View style={{ gap: space.sm }}><Button label={t.depositTitle} onPress={() => nav.go({ name: 'addMoney' })} /><Button kind="soft" label={t.sendOrWithdraw} disabled={!active.known || active.balanceUsd <= 0} onPress={() => nav.go({ name: 'withdraw' })} /></View>}>
      <Panel style={s.big}>
        <T v="body" c={color.muted}>{t.moneyIn}</T>
        <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(active.balanceNgn)}</T>
        <T v="small" c={color.muted}>{active.known ? usd(active.balanceUsd) : t.neverUpdated}</T>
      </Panel>
      {active.pendingNgn > 0 && (
        <Panel style={s.line}>
          <T v="label">{t.status.pending}</T>
          <T v="label" c={color.amber}>{money(active.pendingNgn)}</T>
        </Panel>
      )}
      <PayLinkCard />
      <Panel>
        <Section title={t.paidInList} />
        {active.entries.length === 0 && <T v="body" c={color.muted} style={s.center}>{t.nothingHere}</T>}
        {active.entries.map((e, i) => (
          <Rise key={e.entryId} delay={Math.min(i, 6) * motion.stagger}>
            <View style={s.entry} accessible accessibilityLabel={`${word(e)}, ${money(e.amountNgnMinor)}${e.type === 'CREDIT' ? `, ${t.offlineTag}` : ''}`}>
              <View style={{ flex: 1 }}>
                <T v="label">{word(e)}</T>
                <T v="small" c={color.muted}>{when(e.createdAt)}</T>
                {e.type === 'CREDIT' && <OfflineTag />}
                {e.paypalCaptureId && <T v="tiny" c={color.muted} selectable>{e.paypalCaptureId}</T>}
              </View>
              <T v="label" c={out(e) ? color.text : color.green}>{`${out(e) ? '-' : '+'}${money(e.amountNgnMinor)}`}</T>
            </View>
          </Rise>
        ))}
      </Panel>
    </Screen>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * ACT-14. Money leaves the Online wallet for a PayPal email: the account's own, or anyone's.
 * The person types an amount in naira; the exchange rate comes with the wallet.
 */
export function Withdraw() {
  const nav = useNav();
  const { active, withdrawalOpen, withdrawal, online } = useApp();
  const [other, setOther] = useState(false);
  const [email, setEmail] = useState('');
  const [naira, setNaira] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<{ amountNgn: number; to: string } | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => { if (online) void refreshWallet().catch(() => undefined); }, []);

  const kobo = naira * 100;
  const target = email.trim().toLowerCase();
  const emailOk = !other || EMAIL.test(target);
  // The whole balance is sent as exactly the dollars held, so no rounding leaves a few cents behind.
  const all = kobo >= active.balanceNgn && active.balanceNgn > 0;
  const rate = active.fxRate || '1500.00';
  const usdAmount = all ? active.balanceUsd : convertNgnToUsd(Money.fromMinor(kobo, 'NGN').getValue(), rate).getValue().minor;
  // What really moves: PayPal takes whole cents, so the naira shown is what those cents are worth.
  const worthKobo = all ? active.balanceNgn : convertUsdToNgn(Money.fromMinor(usdAmount, 'USD').getValue(), rate).getValue().minor;
  const tooMuch = kobo > active.balanceNgn;
  const ready = kobo > 0 && !tooMuch && usdAmount > 0 && emailOk && online;
  const to = other ? target : active.payoutEmail;

  const press = (k: string) => setNaira(a => (k === 'del' ? Math.floor(a / 10) : Math.min(Number(`${a}${k}`), Math.floor(active.balanceNgn / 100))));

  const go = async () => {
    setBusy(true); setProblem(null);
    try {
      const r = await withdraw(usdAmount, worthKobo, other ? target : null);
      if (r.status === 'FAILED') setProblem(t.withdrawFailed); else setSent({ amountNgn: worthKobo, to });
    } catch (e) {
      setProblem(isCode(e, 'INSUFFICIENT_BALANCE') ? t.insufficientBalance(money(active.balanceNgn)) : apiMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Sending to someone else asks for the PIN first. Sending to your own PayPal doesn't: the money stays yours.
  if (asking) {
    return <ConfirmPin heading={t.sendAmountTo(money(worthKobo), target)} onCancel={() => setAsking(false)} onConfirmed={() => { setAsking(false); void go(); }} />;
  }

  if (sent || withdrawalOpen) {
    const amount = sent?.amountNgn ?? withdrawal?.amountNgnMinor ?? 0;
    const where = sent?.to ?? withdrawal?.recipientEmail ?? active.payoutEmail;
    return (
      <Screen head={<CurvedHeader back bell={false} title={t.sendTitle} />} footer={<Button label={t.done} onPress={() => nav.reset({ name: 'home' })} />}>
        <Rise>
          <Panel style={s.big}>
            <StatusMark status="pending" size={44} />
            <T v="title" style={s.center}>{t.withdrawPending}</T>
            {amount > 0 && <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(amount)}</T>}
            <T v="small" c={color.muted} style={s.center}>{t.sentTo(where)}</T>
          </Panel>
        </Rise>
        <T v="body" c={color.muted} style={s.center}>{t.withdrawPendingNote}</T>
        <HearIt say={`${t.withdrawPending}. ${sayNaira(amount)}`} />
      </Screen>
    );
  }

  const empty = active.balanceUsd <= 0;
  const label = empty ? t.nothingToWithdraw : !kobo ? t.enterAmount : other ? t.sendAmountTo(money(worthKobo), target || '…') : t.withdrawAmount(money(worthKobo));
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.sendTitle} />} footer={<Button label={label} disabled={empty || !ready} loading={busy} onPress={() => { if (other) setAsking(true); else void go(); }} />}>
      <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={t.withdrawTo}>
        {[{ on: !other, label: t.toMyPayPal, set: () => setOther(false) }, { on: other, label: t.toSomeoneElse, set: () => setOther(true) }].map(c => (
          <Pressable key={c.label} accessibilityRole="radio" accessibilityState={{ selected: c.on }} accessibilityLabel={c.label} onPress={c.set} style={[s.chip, c.on && s.chipOn]}>
            <T v="label" c={c.on ? color.text : color.muted}>{c.label}</T>
          </Pressable>
        ))}
      </View>
      {other ? (
        <View style={{ gap: space.xs }}>
          <T v="label">{t.recipientEmail}</T>
          <TextInput
            accessibilityLabel={t.recipientEmail} value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" placeholder="name@example.com" placeholderTextColor={color.muted} style={s.input}
          />
          <T v="small" c={email && !emailOk ? color.coral : color.muted}>{email && !emailOk ? t.recipientInvalid : t.recipientHint}</T>
        </View>
      ) : (
        <Panel><Line label={t.withdrawTo} value={active.payoutEmail || '—'} /></Panel>
      )}
      <Panel style={s.amount}>
        <T v="small" c={color.muted}>{t.amountToSend}</T>
        <T v="moneyL" c={kobo ? color.text : color.muted} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{naira ? `₦${naira.toLocaleString('en-US')}` : '₦0'}</T>
        <T v="small" c={tooMuch ? color.coral : color.muted}>{tooMuch ? t.tooMuchToSend : `${t.availableNow}: ${money(active.balanceNgn)}`}</T>
        {kobo > 0 && !tooMuch && worthKobo !== kobo && <T v="small" c={color.amber} style={s.center}>{t.wholeCents(usd(usdAmount), money(worthKobo))}</T>}
        {!empty && <Button kind="quiet" label={t.sendAll} onPress={() => setNaira(Math.floor(active.balanceNgn / 100))} />}
      </Panel>
      {other && <T v="small" c={color.amber}>{t.recipientCheck}</T>}
      {!online && <Problem text={t.needsInternet} />}
      {problem && <Problem text={problem} />}
      <Keypad onKey={press} />
      <T v="small" c={color.muted} style={s.center}>{t.withdrawNote}</T>
    </Screen>
  );
}

function Problem({ text }: { text: string }) {
  return (
    <Panel style={s.problem}>
      <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
      <T v="label" style={{ flex: 1 }} accessibilityLiveRegion="polite">{text}</T>
    </Panel>
  );
}

const s = StyleSheet.create({
  big: { alignItems: 'center', gap: space.xs, paddingVertical: space.xl },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  center: { textAlign: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chips: { flexDirection: 'row', gap: space.sm },
  linkHead: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  chip: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: color.panel, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  chipOn: { backgroundColor: color.panelHigh, borderColor: color.blue },
  input: { ...type.heading, color: color.text, height: touch.field, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.md },
  amount: { gap: space.hair, paddingVertical: space.lg, alignItems: 'center' },
});

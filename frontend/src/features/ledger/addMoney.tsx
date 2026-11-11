import React, { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle } from 'lucide-react-native';
import { convertNgnToUsd, convertUsdToNgn } from '@tpay/shared/domain/convertNgnToUsd';
import { Money } from '@tpay/shared/shared/domain/Money';
import { color, icon, space } from '../../theme/tokens';
import { Keypad } from '../../components/keypad';
import { Button, HearIt, Panel, Rise, T, money, naira, sayNaira, usd } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { StatusMark } from '../../components/money';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { t } from '../../i18n';
import { apiMessage, isCode } from '../errors';
import {
  completeDeposit, forgetDeposit, loadDeposit, openDepositApproval, startDeposit, type PendingDeposit,
} from './walletActivities';

// A PayPal checkout of less than a dollar isn't worth making; this matches the backend.
const MIN_NGN = 1500;
const MAX_NGN = 10_000_000;

type Stage =
  | { kind: 'enter' }
  | { kind: 'working' }
  | { kind: 'done'; amountNgn: number }
  | { kind: 'pending'; amountNgn: number };

/**
 * Add money: the person pays with PayPal and the dollars are captured into the Main wallet.
 * The wallet is credited by the backend, once, only after PayPal confirms the capture.
 */
export function AddMoney() {
  const nav = useNav();
  const { active, online } = useApp();
  const [naraAmount, setNaira] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: 'enter' });
  const [problem, setProblem] = useState<string | null>(null);
  const order = useRef<PendingDeposit | null>(null);

  const kobo = naraAmount * 100;
  const tooSmall = naraAmount > 0 && naraAmount < MIN_NGN;
  const ready = naraAmount >= MIN_NGN && online;
  const press = (k: string) => setNaira(a => (k === 'del' ? Math.floor(a / 10) : Math.min(Number(`${a}${k}`), MAX_NGN)));

  const finish = async (pending: PendingDeposit) => {
    try {
      const result = await completeDeposit(pending.depositId);
      setStage({ kind: result.status === 'COMPLETED' ? 'done' : 'pending', amountNgn: pending.amountNgnMinor });
    } catch (e) {
      setStage({ kind: 'enter' });
      setProblem(isCode(e, 'ORDER_NOT_APPROVED') ? t.depositNotFinished : apiMessage(e));
    }
  };

  const go = async () => {
    setProblem(null);
    setStage({ kind: 'working' });
    try {
      // Pick up a checkout left half-finished for the same amount instead of making a second one.
      const saved = await loadDeposit();
      const pending = order.current ?? (saved?.amountNgnMinor === kobo ? saved : await startDeposit(kobo));
      order.current = pending;
      const outcome = await openDepositApproval(pending);
      if (outcome === 'cancelled') { order.current = null; setStage({ kind: 'enter' }); setProblem(t.depositCancelled); return; }
      if (outcome === 'dismissed') { setStage({ kind: 'enter' }); setProblem(t.depositNotFinished); return; }
      await finish(pending);
    } catch (e) {
      setStage({ kind: 'enter' });
      setProblem(apiMessage(e));
    }
  };

  if (stage.kind === 'done' || stage.kind === 'pending') {
    const done = stage.kind === 'done';
    return (
      <Screen head={<CurvedHeader bell={false} title={t.depositTitle} />} footer={<Button label={t.done} onPress={() => { void forgetDeposit(); nav.reset({ name: 'ledger' }); }} />}>
        <Rise>
          <Panel style={s.big}>
            <StatusMark status={done ? 'paid' : 'pending'} size={44} big={done} />
            <T v="title" style={s.center}>{done ? t.depositDone : t.depositPending}</T>
            <T v="moneyL" numberOfLines={1} adjustsFontSizeToFit>{money(stage.amountNgn)}</T>
            <T v="small" c={color.muted} style={s.center}>{done ? t.depositDoneNote : t.depositPendingNote}</T>
          </Panel>
        </Rise>
        <HearIt auto say={`${done ? t.depositDone : t.depositPending}. ${sayNaira(stage.amountNgn)}`} />
      </Screen>
    );
  }

  const working = stage.kind === 'working';
  // PayPal takes whole cents, so show what will really be taken and credited.
  const rate = active.fxRate || '1500.00';
  const cents = naraAmount >= MIN_NGN ? convertNgnToUsd(Money.fromMinor(kobo, 'NGN').getValue(), rate).getValue() : null;
  const worth = cents ? convertUsdToNgn(cents, rate).getValue().minor : 0;
  const usdNote = cents ? `${usd(cents.minor)} (${t.depositAdds(money(worth))})` : null;
  return (
    <Screen
      head={<CurvedHeader back bell={false} title={t.depositTitle} />}
      footer={<Button label={working ? t.depositWorking : !naraAmount ? t.enterAmount : t.depositContinue} disabled={!ready} loading={working} onPress={() => { void go(); }} />}
    >
      <Panel style={s.amount}>
        <T v="small" c={color.muted}>{t.depositAmount}</T>
        <T v="moneyL" c={naraAmount ? color.text : color.muted} numberOfLines={1} adjustsFontSizeToFit accessibilityLiveRegion="polite">{naira(kobo)}</T>
        <T v="small" c={tooSmall ? color.coral : color.muted}>{tooSmall ? t.depositTooSmall : usdNote ? `${t.depositTakes} ${usdNote}` : t.depositIntro}</T>
      </Panel>
      {!online && <Problem text={t.needsInternet} />}
      {problem && <Problem text={problem} />}
      <Keypad onKey={press} />
      <T v="small" c={color.muted} style={s.center}>{t.depositSandbox}</T>
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
  center: { textAlign: 'center' },
  amount: { gap: space.hair, paddingVertical: space.lg, alignItems: 'center' },
  problem: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

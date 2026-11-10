import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, Cpu, ShieldCheck, Wifi } from 'lucide-react-native';
import { color, icon, radius, space } from '../../theme/tokens';
import { Button, Panel, T } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { connectivity, localModel } from '../../composition';
import type { ModelState } from '../../adapters/ai/onDeviceModel';
import { t } from '../../i18n';

/** The model's state, kept current while a screen shows it. */
export function useModelState(): ModelState {
  const [state, setState] = useState<ModelState>(localModel.state());
  useEffect(() => {
    const off = localModel.subscribe(setState);
    void localModel.refresh().then(setState);
    return off;
  }, []);
  return state;
}

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

/** One line for Settings: what the offline assistant is doing now. */
export function modelNote(state: ModelState): string {
  switch (state.kind) {
    case 'ready': return t.offlineAiReady;
    case 'downloading': return t.offlineAiDownloading(Math.floor((state.received / state.total) * 100));
    case 'unsupported': return state.reason === 'memory' ? t.offlineAiMemory : t.offlineAiDevice;
    default: return t.offlineAiNotDownloaded;
  }
}

const FAILURE = { space: t.offlineAiSpace, network: t.offlineAiNetwork, damaged: t.offlineAiDamaged };

/** Optional, after install: the person decides whether a large download is worth it. */
export function OfflineAssistant() {
  const state = useModelState();
  const [wifi, setWifi] = useState(true);
  useEffect(() => { void connectivity.onWifi().then(setWifi); }, [state.kind]);
  const size = t.megabytes(mb(localModel.bytes));

  const footer = state.kind === 'ready'
    ? <Button kind="soft" label={t.offlineAiRemove} onPress={() => { void localModel.remove(); }} />
    : state.kind === 'downloading'
      ? <Button kind="soft" label={t.offlineAiCancel} onPress={() => { void localModel.cancel(); }} />
      : state.kind === 'unsupported'
        ? undefined
        : <Button label={t.offlineAiDownload(size)} onPress={() => { void localModel.download(); }} />;

  const percent = state.kind === 'downloading' ? Math.min(1, state.received / state.total) : 0;
  return (
    <Screen head={<CurvedHeader back bell={false} title={t.offlineAssistant} />} footer={footer}>
      <Panel style={s.row}>
        <View style={s.mark}><Cpu size={icon.md} color={color.blue} strokeWidth={1.8} /></View>
        <View style={{ flex: 1, gap: space.hair }}>
          <T v="label">{t.offlineAiIntro}</T>
          <T v="small" c={color.muted}>{t.offlineAiOptional}</T>
        </View>
      </Panel>

      <Panel>
        <T v="heading" accessibilityLiveRegion="polite">{modelNote(state)}</T>
        {state.kind === 'downloading' && (
          <View style={s.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.floor(percent * 100) }}>
            <View style={[s.fill, { width: `${percent * 100}%` }]} />
          </View>
        )}
        {state.kind === 'downloading' && <T v="small" c={color.muted}>{`${t.megabytes(mb(state.received))} / ${size}`}</T>}
        {state.kind === 'absent' && <T v="small" c={color.muted}>{size}</T>}
      </Panel>

      {state.kind === 'failed' && (
        <Panel style={s.row}>
          <AlertCircle size={icon.md} color={color.coral} strokeWidth={1.8} />
          <T v="label" style={{ flex: 1 }}>{FAILURE[state.reason]}</T>
        </Panel>
      )}
      {!wifi && (state.kind === 'absent' || state.kind === 'failed' || state.kind === 'downloading') && (
        <Panel style={s.row}>
          <Wifi size={icon.md} color={color.amber} strokeWidth={1.8} />
          <T v="label" style={{ flex: 1 }}>{t.offlineAiWifi}</T>
        </Panel>
      )}
      <View style={s.row}>
        <ShieldCheck size={icon.md} color={color.green} strokeWidth={1.7} />
        <T v="small" c={color.muted} style={{ flex: 1 }}>{t.offlineAiPrivacy}</T>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  mark: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: color.panelHigh, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: color.blue },
});

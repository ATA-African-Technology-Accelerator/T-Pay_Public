import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Activity, ChevronRight, Cpu, Globe, HelpCircle, Lock, Send, ShieldCheck, UserRound } from 'lucide-react-native';
import { color, icon, radius, space, touch } from '../../theme/tokens';
import { Panel, Press, T } from '../../components/ui';
import { Avatar, CurvedHeader, Screen } from '../../components/shell';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { languageCodes, languages, t } from '../../i18n';
import { softwareOnly } from '../../adapters/crypto/deviceSigner';
import { api, store } from '../../composition';
import { profileStore } from '../../session/profileStore';
import { withSession } from '../../session/guard';
import { modelNote, useModelState } from './offlineAssistant';
import { useHealth } from '../../state/health';

const CASH_OUT = 'ui.autoCashOut';

/** ACT-16. Read from the phone; when online, the backend's copy wins and is saved here. */
export function SettingsScreen() {
  const nav = useNav();
  const { name, profile, language, online, reload } = useApp();
  const model = useModelState();
  const health = useHealth();
  const service = !health ? t.serviceUnknown : health.database === 'down' ? t.serviceDbDown : health.paypal === 'down' ? t.servicePayPalDown : t.serviceOk(health.mode);
  const serviceOk = !!health && health.status === 'ok';
  // Whether money received offline goes on to PayPal by itself. The server holds the choice; the
  // phone keeps the last answer so it can show it with no network.
  const [cashOut, setCashOut] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { void store.getMeta<boolean>(CASH_OUT).then(v => { if (v !== null) setCashOut(v); }); }, []);
  const changeCashOut = async (on: boolean) => {
    const before = cashOut;
    setCashOut(on); setSaving(true);
    try {
      const saved = await withSession(() => api.updateProfile({ autoCashOut: on }));
      setCashOut(saved.autoCashOut);
      await store.setMeta(CASH_OUT, saved.autoCashOut);
    } catch {
      setCashOut(before);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (!online || !profile) return;
    void withSession(() => api.getProfile()).then(async remote => {
      setCashOut(remote.autoCashOut);
      await store.setMeta(CASH_OUT, remote.autoCashOut);
      const next = { displayName: remote.displayName, language: profile.language, payoutEmail: remote.payoutEmail };
      if (next.displayName !== profile.displayName || next.payoutEmail !== profile.payoutEmail) {
        await profileStore.save(next);
        await reload();
      }
    }).catch(() => undefined);
  }, [online]);

  const Row = ({ label, note, Icon, onPress }: { label: string; note?: string; Icon: typeof Globe; onPress(): void }) => (
    <Press accessibilityRole="button" accessibilityLabel={note ? `${label}, ${note}` : label} onPress={onPress} style={a.setting}>
      <View style={a.rowIcon}><Icon size={icon.md} color={color.text} strokeWidth={1.7} /></View>
      <View style={{ flex: 1 }}>
        <T v="label">{label}</T>
        {note && <T v="small" c={color.muted} numberOfLines={1}>{note}</T>}
      </View>
      <ChevronRight size={icon.md} color={color.muted} strokeWidth={1.8} />
    </Press>
  );
  return (
    <Screen tabsFor="settings" head={<CurvedHeader home title={t.profile} />}>
      <Panel style={a.me}>
        <Avatar name={name || 'T'} size={54} />
        <View style={{ flex: 1 }}>
          <T v="heading" numberOfLines={2}>{name}</T>
          <T v="small" c={color.muted}>{t.payAndCollect}</T>
        </View>
      </Panel>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.account}</T>
        <Row label={t.yourDetails} note={profile?.payoutEmail} Icon={UserRound} onPress={() => nav.go({ name: 'details', edit: true })} />
        <Row label={t.changeLanguage} note={languages[languageCodes.indexOf(language)]} Icon={Globe} onPress={() => nav.go({ name: 'language', edit: true })} />
        <Row label={t.offlineAssistant} note={modelNote(model)} Icon={Cpu} onPress={() => nav.go({ name: 'offlineAi' })} />
        <View style={a.setting}>
          <View style={a.rowIcon}><Send size={icon.md} color={color.text} strokeWidth={1.7} /></View>
          <View style={{ flex: 1, paddingVertical: space.sm }}>
            <T v="label">{t.autoCashOut}</T>
            <T v="small" c={color.muted}>{online ? t.autoCashOutNote : t.autoCashOutOffline}</T>
          </View>
          <Switch
            accessibilityLabel={t.autoCashOut} accessibilityHint={t.autoCashOutNote}
            value={cashOut ?? true} disabled={!online || saving} onValueChange={on => { void changeCashOut(on); }}
            trackColor={{ false: color.panelHigh, true: color.green }} thumbColor={color.white}
          />
        </View>
      </View>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.security}</T>
        <Row label={t.lockApp} Icon={Lock} onPress={() => nav.reset({ name: 'lock' })} />
        <View style={a.setting} accessible accessibilityLabel={`${t.phoneSecurity}, ${softwareOnly ? t.tierB : t.tierBHardware}`}>
          <View style={a.rowIcon}><ShieldCheck size={icon.md} color={color.green} strokeWidth={1.7} /></View>
          <View style={{ flex: 1 }}>
            <T v="label">{t.phoneSecurity}</T>
            <T v="small" c={color.muted}>{softwareOnly ? t.tierB : t.tierBHardware}</T>
          </View>
        </View>
      </View>
      <View style={a.group}>
        <T v="smallStrong" c={color.muted}>{t.support}</T>
        <View style={a.setting} accessible accessibilityLabel={`${t.serviceTitle}, ${service}`}>
          <View style={a.rowIcon}><Activity size={icon.md} color={serviceOk ? color.green : color.amber} strokeWidth={1.7} /></View>
          <View style={{ flex: 1, paddingVertical: space.sm }}>
            <T v="label">{t.serviceTitle}</T>
            <T v="small" c={color.muted}>{service}</T>
          </View>
        </View>
        <Row label={t.help} Icon={HelpCircle} onPress={() => nav.go({ name: 'help' })} />
        <T v="small" c={color.muted} style={{ textAlign: 'center', paddingTop: space.sm }}>{t.buildNote}</T>
      </View>
    </Screen>
  );
}

const a = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center' },
  group: { gap: space.sm },
  setting: { minHeight: touch.row, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, backgroundColor: color.panel, borderRadius: radius.lg },
  rowIcon: { width: 42, height: 42, borderRadius: radius.pill, backgroundColor: color.panelHigh, alignItems: 'center', justifyContent: 'center' },
});

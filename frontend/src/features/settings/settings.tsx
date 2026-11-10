import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChevronRight, Cpu, Globe, HelpCircle, Lock, ShieldCheck, UserRound } from 'lucide-react-native';
import { color, icon, radius, space, touch } from '../../theme/tokens';
import { Panel, Press, T } from '../../components/ui';
import { Avatar, CurvedHeader, Screen } from '../../components/shell';
import { useNav } from '../../nav';
import { useApp } from '../../state/appState';
import { languageCodes, languages, t } from '../../i18n';
import { softwareOnly } from '../../adapters/crypto/deviceSigner';
import { api } from '../../composition';
import { profileStore } from '../../session/profileStore';
import { withSession } from '../../session/guard';
import { modelNote, useModelState } from './offlineAssistant';

/** ACT-16. Read from the phone; when online, the backend's copy wins and is saved here. */
export function SettingsScreen() {
  const nav = useNav();
  const { name, profile, language, online, reload } = useApp();
  const model = useModelState();
  useEffect(() => {
    if (!online || !profile) return;
    void withSession(() => api.getProfile()).then(async remote => {
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

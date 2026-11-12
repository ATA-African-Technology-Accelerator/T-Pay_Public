import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import { color, radius, space, touch, type } from '../../theme/tokens';
import { Button, Card, T, speakNaturally, useCardW } from '../../components/ui';
import { CurvedHeader, Screen } from '../../components/shell';
import { Steps } from '../../components/money';
import { useNav, type Route } from '../../nav';
import { t } from '../../i18n';
import { File } from 'expo-file-system';
import { readRequest, takeReceipt, takeVoucher } from './payments';
import { pickPictureSize, readQrFromJpeg } from './qrDecode';
import { closeLink } from './link';

type ScanRoute = Extract<Route, { name: 'scan' }>;

// The phone's built-in reader usually finds a code at once. When it hasn't after this long (some
// phones have none, or it misses dense codes), T-Pay's own reader looks at a still photo instead,
// one every so often, until a code is read.
const OWN_READER_AFTER_MS = 2_000;
const OWN_READER_EVERY_MS = 1_500;

const COPY = {
  request: { at: 1 as const, title: t.scanSeller, hint: t.noNetworkNeeded },
  voucher: { at: 2 as const, title: t.scanVoucher, hint: t.scanVoucherHint },
  receipt: { at: 3 as const, title: t.scanReceipt, hint: t.scanReceiptHint },
};

/** The one camera screen. What it is looking for decides what happens next. */
export function Scan({ route }: { route: ScanRoute }) {
  const nav = useNav();
  const w = useCardW();
  const [permission, requestPermission] = useCameraPermissions();
  const [pasting, setPasting] = useState(Platform.OS === 'web');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const handling = useRef(false);
  const cam = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const copy = COPY[route.kind];

  useEffect(() => { if (permission && !permission.granted && permission.canAskAgain) void requestPermission(); }, [permission?.granted]);
  const handsFree = route.kind === 'request' && route.handsFree === true;
  useEffect(() => { if (handsFree) void speakNaturally(copy.title); }, []);

  const handle = async (frame: string) => {
    if (handling.current || !frame.trim()) return;
    handling.current = true;
    setBusy(true);
    try {
      if (route.kind === 'request') {
        const read = await readRequest(frame);
        if (read.ok) nav.go({ name: 'review', scanned: read.value, expected: route.expected, handsFree });
        else nav.go({ name: 'refusal', code: read.code, side: 'customer' });
      } else if (route.kind === 'voucher') {
        const taken = await takeVoucher(frame, route.open);
        if (taken.ok) {
          // A scanned voucher ends the Bluetooth wait (contract 5.4, merchant fallback).
          closeLink();
          nav.reset({ name: 'credit', voucherId: taken.value.id, bluetooth: false });
        } else {
          nav.go({ name: 'refusal', code: taken.code, side: 'merchant', amount: route.open.request.payload.amountNgnMinor, existingId: taken.existing?.id });
        }
      } else {
        const taken = await takeReceipt(frame, route.voucherId);
        if (taken.ok) nav.reset({ name: 'delivered', voucherId: route.voucherId });
        else nav.go({ name: 'refusal', code: taken.code, side: 'customer' });
      }
    } finally {
      // Let the camera settle on a new code before reading again.
      setTimeout(() => { handling.current = false; setBusy(false); }, 900);
    }
  };

  // T-Pay's own reader, for phones whose built-in one is missing or keeps missing the code.
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let looking = false;
    const look = async () => {
      if (!live || looking || handling.current || !cam.current) return;
      looking = true;
      try {
        const photo = await cam.current.takePictureAsync({ base64: true, quality: 0.7, skipProcessing: true, shutterSound: false });
        try { if (photo?.uri) new File(photo.uri).delete(); } catch { /* the cache is cleared anyway */ }
        const text = photo?.base64 && live ? readQrFromJpeg(photo.base64) : null;
        if (text && live) void handle(text);
      } catch { /* the camera was busy or closing; try again next time */ }
      finally { looking = false; }
    };
    let timer: ReturnType<typeof setInterval> | undefined;
    const wait = setTimeout(() => { timer = setInterval(() => { void look(); }, OWN_READER_EVERY_MS); }, OWN_READER_AFTER_MS);
    return () => { live = false; clearTimeout(wait); clearInterval(timer); };
  }, [ready]);

  const onReady = () => {
    setReady(true);
    void cam.current?.getAvailablePictureSizesAsync().then(sizes => setPictureSize(pickPictureSize(sizes))).catch(() => undefined);
  };

  const paste = async () => { const clip = await Clipboard.getStringAsync().catch(() => ''); if (clip) setText(clip); setPasting(true); };
  const camera = Platform.OS !== 'web' && permission?.granted;

  return (
    <Screen head={<CurvedHeader back bell={false} title={copy.title} />}>
      <Steps at={copy.at} />
      {camera ? (
        <Card w={w} h={300} fill={color.panel} pill={<T v="smallStrong" c={color.white}>{t.noNetwork}</T>}>
          <CameraView
            ref={cam} onCameraReady={onReady} pictureSize={pictureSize} animateShutter={false}
            style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : ({ data }) => { void handle(data); }}
          />
          <View pointerEvents="none" style={s.frame}>{(['tl', 'tr', 'bl', 'br'] as const).map(k => <View key={k} style={[s.corner, s[k]]} />)}</View>
        </Card>
      ) : (
        <View style={s.noCamera}>
          <T v="body" c={color.muted}>{Platform.OS === 'web' ? t.noCamera : t.cameraNeeded}</T>
          {Platform.OS !== 'web' && permission && !permission.granted && <Button kind="soft" label={t.allowCamera} onPress={() => { void requestPermission(); }} />}
        </View>
      )}
      <T v="body" c={color.muted} style={s.center}>{busy ? t.loading : copy.hint}</T>
      {pasting ? (
        <View style={{ gap: space.sm }}>
          <TextInput
            accessibilityLabel={t.pasteHere} placeholder={t.pasteHere} placeholderTextColor={color.muted} value={text} onChangeText={setText}
            autoCapitalize="none" autoCorrect={false} multiline style={s.input}
          />
          <Button label={t.useCode} disabled={!text.trim()} loading={busy} onPress={() => { void handle(text); }} />
        </View>
      ) : (
        <Button kind="quiet" label={t.pasteCode} onPress={() => { void paste(); }} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { textAlign: 'center' },
  frame: { position: 'absolute', left: 30, right: 30, top: 60, bottom: 30 },
  corner: { position: 'absolute', width: 40, height: 40, borderColor: color.blue },
  tl: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: radius.md },
  tr: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: radius.md },
  bl: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: radius.md },
  br: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: radius.md },
  noCamera: { gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: color.panel },
  input: { ...type.small, color: color.text, minHeight: touch.field * 1.5, padding: space.md, backgroundColor: color.panel, borderRadius: radius.md, textAlignVertical: 'top' },
});

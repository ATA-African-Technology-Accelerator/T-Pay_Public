// Set in frontend/.env (see .env.example). EXPO_PUBLIC_ values are bundled into the app,
// so only public values belong here — never the root private key.
const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const config = {
  apiUrl,
  rootPublicKey: process.env.EXPO_PUBLIC_ROOT_PUBLIC_KEY ?? '',
  /** No backend configured: the app runs on sample data only. */
  sampleOnly: apiUrl === '',
};

import { readVault, saveVault, clearVault } from './credential-vault';
import { extensionApi } from './webextension';
import { z } from 'zod';
const credentialsSchema = z.object({
  textKey: z.string().max(2000).default(''),
  falKey: z.string().max(2000).default(''),
  textBaseUrl: z.string().url().optional(),
});
export type Credentials = z.infer<typeof credentialsSchema>;
function privatePersistence() {
  return typeof extensionApi().storage.local.setAccessLevel !== 'function';
}
export async function restrictStorage() {
  for (const area of [
    extensionApi().storage.local,
    extensionApi().storage.session,
  ])
    if (typeof area.setAccessLevel === 'function')
      await area.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
}
export async function credentials(): Promise<Credentials> {
  await restrictStorage();
  const session = await extensionApi().storage.session.get('credentials');
  if (session.credentials) return credentialsSchema.parse(session.credentials);
  return credentialsSchema.parse(
    (privatePersistence()
      ? await readVault()
      : (await extensionApi().storage.local.get('credentials')).credentials) ??
      {},
  );
}
export async function saveCredentials(value: Credentials, remember: boolean) {
  await restrictStorage();
  const parsed = credentialsSchema.parse(value);
  // Remove the persistent copy before switching to a session-only policy.
  if (!remember) await extensionApi().storage.local.remove('credentials');
  await extensionApi().storage.session.set({ credentials: parsed });
  if (privatePersistence()) {
    await extensionApi().storage.local.remove('credentials');
    if (remember) await saveVault(parsed);
    else await clearVault();
  } else if (remember)
    await extensionApi().storage.local.set({ credentials: parsed });
}
export async function forgetCredentials() {
  if (privatePersistence()) await clearVault();
  await Promise.all([
    extensionApi().storage.local.remove('credentials'),
    extensionApi().storage.session.remove('credentials'),
  ]);
}
export function providerBase(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      'Use a base URL without credentials, query parameters or fragments.',
    );
  if (
    url.protocol !== 'https:' &&
    !(
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
  )
    throw new Error('Provider URLs must use HTTPS, or HTTP on localhost.');
  return url.href.replace(/\/$/, '');
}
export const FAL_ORIGINS = [
  'https://queue.fal.run/*',
  'https://*.fal.media/*',
  'https://storage.googleapis.com/*',
];
export function providerOrigins(base: string) {
  return [`${new URL(providerBase(base)).origin}/*`, ...FAL_ORIGINS];
}

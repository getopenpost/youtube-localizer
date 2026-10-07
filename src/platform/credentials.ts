import { z } from 'zod';
const credentialsSchema = z.object({
  textKey: z.string().max(2000).default(''),
  falKey: z.string().max(2000).default(''),
});
export type Credentials = z.infer<typeof credentialsSchema>;
export async function restrictStorage() {
  await Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]);
}
export async function credentials(): Promise<Credentials> {
  await restrictStorage();
  const session = await chrome.storage.session.get('credentials');
  if (session.credentials) return credentialsSchema.parse(session.credentials);
  return credentialsSchema.parse(
    (await chrome.storage.local.get('credentials')).credentials ?? {},
  );
}
export async function saveCredentials(value: Credentials, remember: boolean) {
  await restrictStorage();
  const parsed = credentialsSchema.parse(value);
  // Remove the persistent copy before switching to a session-only policy.
  if (!remember) await chrome.storage.local.remove('credentials');
  await chrome.storage.session.set({ credentials: parsed });
  if (remember) await chrome.storage.local.set({ credentials: parsed });
}
export async function forgetCredentials() {
  await Promise.all([
    chrome.storage.local.remove('credentials'),
    chrome.storage.session.remove('credentials'),
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
export function providerOrigins(base: string, withFal: boolean) {
  const origin = `${new URL(providerBase(base)).origin}/*`;
  return withFal
    ? [
        origin,
        'https://queue.fal.run/*',
        'https://*.fal.media/*',
        'https://storage.googleapis.com/*',
      ]
    : [origin];
}

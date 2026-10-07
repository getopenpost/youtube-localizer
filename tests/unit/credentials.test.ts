import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import {
  credentials,
  saveCredentials,
  forgetCredentials,
} from '../../src/platform/credentials';

function area() {
  const values: Record<string, unknown> = {};
  return {
    values,
    async get(key: string) {
      return { [key]: values[key] };
    },
    async set(data: Record<string, unknown>) {
      Object.assign(values, data);
    },
    async remove(key: string) {
      delete values[key];
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
it('keeps remembered Firefox keys outside content-accessible local storage and clears them when remembering is disabled', async () => {
  const local = area(),
    session = area();
  vi.stubGlobal('browser', {
    runtime: { id: 'fixture' },
    storage: { local, session },
  });
  await saveCredentials(
    { textKey: 'text-key', imageKey: 'image-key', falKey: '' },
    true,
  );
  expect(local.values.credentials).toBeUndefined();
  await session.remove('credentials');
  expect(await credentials()).toEqual({
    textKey: 'text-key',
    imageKey: 'image-key',
    falKey: '',
  });
  await saveCredentials({ textKey: 'session-only', falKey: '' }, false);
  await session.remove('credentials');
  expect(await credentials()).toEqual({
    textKey: '',
    imageKey: '',
    falKey: '',
  });
  await forgetCredentials();
});
it('retains Chromium trusted-context access restrictions when storing keys', async () => {
  const local = { ...area(), setAccessLevel: vi.fn(async () => {}) };
  const session = { ...area(), setAccessLevel: vi.fn(async () => {}) };
  vi.stubGlobal('chrome', {
    runtime: { id: 'fixture' },
    storage: { local, session },
  });
  await saveCredentials({ textKey: 'chrome-key', falKey: '' }, true);
  expect(local.setAccessLevel).toHaveBeenCalledWith({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  expect(session.setAccessLevel).toHaveBeenCalledWith({
    accessLevel: 'TRUSTED_CONTEXTS',
  });
  expect(await credentials()).toEqual({
    textKey: 'chrome-key',
    imageKey: '',
    falKey: '',
  });
  await forgetCredentials();
});

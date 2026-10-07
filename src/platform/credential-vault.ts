import { openDB } from 'idb';
const VAULT_KEY = 'providers';
async function vault() {
  return openDB('youtube-localizer-credentials', 1, {
    upgrade(db) {
      db.createObjectStore('keys');
    },
  });
}
export async function readVault(): Promise<unknown> {
  const db = await vault();
  try {
    return await db.get('keys', VAULT_KEY);
  } finally {
    db.close();
  }
}
export async function saveVault(value: unknown) {
  const db = await vault();
  try {
    await db.put('keys', value, VAULT_KEY);
  } finally {
    db.close();
  }
}
export async function clearVault() {
  const db = await vault();
  try {
    await db.delete('keys', VAULT_KEY);
  } finally {
    db.close();
  }
}

import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

// ─────────────────────────────────────────────────────────────────────────────
// Crypto Utilities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash a password using PBKDF2-SHA-256.
 * Returns a string in the form "pbkdf2:<saltHex>:<hashHex>".
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  return `pbkdf2:${toHex(salt)}:${toHex(new Uint8Array(hashBuffer))}`;
}

/**
 * Verify a plaintext password against a stored PBKDF2 hash.
 * Falls back to a direct string comparison for legacy (unhashed) records
 * so existing users are not locked out — the record is then re-hashed on
 * successful login.
 */
export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  if (!stored.startsWith('pbkdf2:')) {
    // Legacy plaintext — compare directly; caller should re-hash on success
    return password === stored;
  }
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [, saltHex, hashHex] = parts;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const hashBuffer = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const newHashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return newHashHex === hashHex;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Key Encryption (AES-GCM with a device-specific key)
// ─────────────────────────────────────────────────────────────────────────────

const DEVICE_KEY_STORAGE = '_dk';
const API_KEY_STORAGE = '_ak';

async function getDeviceKey(): Promise<CryptoKey> {
  let deviceKeyHex = localStorage.getItem(DEVICE_KEY_STORAGE);
  let keyBytes: Uint8Array;

  if (!deviceKeyHex) {
    keyBytes = crypto.getRandomValues(new Uint8Array(32));
    deviceKeyHex = Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    localStorage.setItem(DEVICE_KEY_STORAGE, deviceKeyHex);
  } else {
    keyBytes = new Uint8Array(
      deviceKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
    );
  }

  return crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

/** Save the Gemini API key encrypted with AES-GCM. */
export async function saveApiKey(apiKey: string): Promise<void> {
  if (!apiKey) {
    localStorage.removeItem(API_KEY_STORAGE);
    return;
  }
  const key = await getDeviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(apiKey)
  );
  const toHex = (buf: Uint8Array) =>
    Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  localStorage.setItem(
    API_KEY_STORAGE,
    `${toHex(iv)}:${toHex(new Uint8Array(encrypted))}`
  );
}

/** Retrieve and decrypt the stored Gemini API key. Returns '' if not found. */
export async function getApiKey(): Promise<string> {
  const stored = localStorage.getItem(API_KEY_STORAGE);
  if (!stored) return '';

  // Legacy: old plaintext key stored under the old settings key name
  if (!stored.includes(':')) {
    // Re-encrypt and migrate
    await saveApiKey(stored);
    return stored;
  }

  try {
    const key = await getDeviceKey();
    const [ivHex, encHex] = stored.split(':');
    const iv = new Uint8Array(ivHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const enc = new Uint8Array(encHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
    return new TextDecoder().decode(decrypted);
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB Schema
// ─────────────────────────────────────────────────────────────────────────────

interface AppDB extends DBSchema {
  notes: {
    key: string;
    value: {
      id: string;
      title: string;
      content: string;
      updatedAt: number;
      createdAt: number;
    };
    indexes: { 'by-updated': number };
  };
  whiteboards: {
    key: string;
    value: {
      id: string;
      title: string;
      document: unknown; // tldraw document state
      updatedAt: number;
      createdAt: number;
    };
    indexes: { 'by-updated': number };
  };
  users: {
    key: string; // username
    value: {
      username: string;
      passwordHash: string; // PBKDF2 hash: "pbkdf2:<saltHex>:<hashHex>"
      createdAt: number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<AppDB>> | null = null;

export const initDB = () => {
  if (!dbPromise) {
    dbPromise = openDB<AppDB>('memory-db', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
          noteStore.createIndex('by-updated', 'updatedAt');

          const whiteboardStore = db.createObjectStore('whiteboards', {
            keyPath: 'id',
          });
          whiteboardStore.createIndex('by-updated', 'updatedAt');
        }
        if (oldVersion < 2) {
          db.createObjectStore('users', { keyPath: 'username' });
        }
      },
    });
  }
  return dbPromise;
};

// ─────────────────────────────────────────────────────────────────────────────
// User Auth (passwords hashed with PBKDF2)
// ─────────────────────────────────────────────────────────────────────────────

export const registerUser = async (username: string, password: string) => {
  const db = await initDB();
  const existing = await db.get('users', username);
  if (existing) {
    throw new Error('Username already exists');
  }
  const passwordHash = await hashPassword(password);
  await db.put('users', { username, passwordHash, createdAt: Date.now() });
};

export const loginUser = async (username: string, password: string) => {
  const db = await initDB();
  const user = await db.get('users', username);
  if (!user) throw new Error('Invalid username or password');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('Invalid username or password');

  // Migrate legacy plaintext passwords to PBKDF2 on successful login
  if (!user.passwordHash.startsWith('pbkdf2:')) {
    const newHash = await hashPassword(password);
    await db.put('users', { ...user, passwordHash: newHash });
  }

  return user;
};

export const updateUser = async (
  oldUsername: string,
  newUsername: string,
  password: string
) => {
  const db = await initDB();
  const user = await db.get('users', oldUsername);
  if (!user) throw new Error('User not found');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new Error('Invalid password');

  if (oldUsername !== newUsername) {
    const existing = await db.get('users', newUsername);
    if (existing) throw new Error('Username already exists');

    await db.delete('users', oldUsername);
    await db.put('users', {
      username: newUsername,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt,
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Notes
// ─────────────────────────────────────────────────────────────────────────────

export const saveNote = async (note: AppDB['notes']['value']) => {
  const db = await initDB();
  await db.put('notes', { ...note, updatedAt: Date.now() });
};

export const getNote = async (id: string) => {
  const db = await initDB();
  return db.get('notes', id);
};

export const getAllNotes = async () => {
  const db = await initDB();
  return db.getAllFromIndex('notes', 'by-updated');
};

export const deleteNote = async (id: string) => {
  const db = await initDB();
  await db.delete('notes', id);
};

// ─────────────────────────────────────────────────────────────────────────────
// Whiteboards
// ─────────────────────────────────────────────────────────────────────────────

export const saveWhiteboard = async (
  whiteboard: AppDB['whiteboards']['value']
) => {
  const db = await initDB();
  await db.put('whiteboards', { ...whiteboard, updatedAt: Date.now() });
};

export const getWhiteboard = async (id: string) => {
  const db = await initDB();
  return db.get('whiteboards', id);
};

export const getAllWhiteboards = async () => {
  const db = await initDB();
  return db.getAllFromIndex('whiteboards', 'by-updated');
};

export const deleteWhiteboard = async (id: string) => {
  const db = await initDB();
  await db.delete('whiteboards', id);
};

// ─────────────────────────────────────────────────────────────────────────────
// Generic Settings (non-sensitive values only — do NOT use for the API key)
// ─────────────────────────────────────────────────────────────────────────────

export const saveSetting = (key: string, value: unknown) => {
  localStorage.setItem(`app-setting-${key}`, JSON.stringify(value));
};

export const getSetting = (key: string, defaultValue: unknown = null) => {
  const val = localStorage.getItem(`app-setting-${key}`);
  return val ? JSON.parse(val) : defaultValue;
};

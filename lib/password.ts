const DEFAULT_ITERATIONS = 310_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const normalizedSalt = new Uint8Array(salt).buffer as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: normalizedSalt, iterations },
    keyMaterial,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left[index] ^ right[index];
  }
  return mismatch === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePassword(password, salt, DEFAULT_ITERATIONS);
  return {
    hash: bytesToBase64(hash),
    salt: bytesToBase64(salt),
    iterations: DEFAULT_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  encodedSalt: string,
  iterations: number,
) {
  const actual = await derivePassword(password, base64ToBytes(encodedSalt), iterations);
  return constantTimeEqual(actual, base64ToBytes(expectedHash));
}

export async function consumePasswordCost(password: string) {
  const salt = new TextEncoder().encode('TNA-HR-DUMMY-SALT');
  await derivePassword(password, salt, DEFAULT_ITERATIONS);
}

export function secureTextEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  return constantTimeEqual(encoder.encode(left), encoder.encode(right));
}
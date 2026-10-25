const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export function validPassword(p) {
  return typeof p === 'string' && p.length >= 12 && p.length <= 256 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /[0-9]/.test(p) && /[^A-Za-z0-9\s]/.test(p);
}
export async function hashPassword(p, salt = randomToken()) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(p), 'PBKDF2', false, ['deriveBits']);
  // Workers Web Crypto supports at most 100,000 iterations per PBKDF2 invocation.
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000}, key, 256);
  return `pbkdf2-sha256$100000$${salt}$${hex(bits)}`;
}
export function validHash(value) { return typeof value === 'string' && /^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/.test(value); }
export async function verifyPassword(p, stored) {
  if (!validHash(stored)) return false;
  const actual = await hashPassword(p, stored.split('$')[2]);
  let diff = actual.length ^ stored.length;
  for (let i=0;i<stored.length;i++) diff |= actual.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

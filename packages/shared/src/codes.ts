const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SESSION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const PARTICIPANT_RE = /^NEXO-[0-9A-HJKMNP-TV-Z]{4}$/;

/** Sorteia `length` caracteres; sem `rand`, usa crypto com rejeição (sem viés de módulo). */
function pick(alphabet: string, length: number, rand?: () => number): string {
  const n = alphabet.length;
  let out = '';
  if (rand) {
    for (let i = 0; i < length; i++) out += alphabet[Math.floor(rand() * n)];
    return out;
  }
  const limit = 256 - (256 % n);
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < length) out += alphabet[b % n];
    }
  }
  return out;
}

export const generateParticipantCode = (rand?: () => number): string =>
  `NEXO-${pick(CROCKFORD, 4, rand)}`;

export const generateRecoveryKey = (rand?: () => number): string => pick(CROCKFORD, 24, rand);

const RECOVERY_KEY_RE = /^[0-9A-HJKMNP-TV-Z]{24}$/;
export const isRecoveryKey = (s: string): boolean => RECOVERY_KEY_RE.test(s);
/** Trim + maiúsculas (a chave é comparada exatamente como gerada). */
export const normalizeRecoveryKey = (s: string): string => s.trim().toUpperCase();

export const generateSessionCode = (rand?: () => number): string => pick(SESSION_ALPHABET, 6, rand);

export const isParticipantCode = (s: string): boolean => PARTICIPANT_RE.test(s);

const confusables = (body: string) => body.replace(/O/g, '0').replace(/[IL]/g, '1');

/** Trim + maiúsculas; em código de participante (com ou sem prefixo) troca O→0, I/L→1 no corpo. */
export function normalizeCode(s: string): string {
  const up = s.trim().toUpperCase();
  if (up.startsWith('NEXO-')) return `NEXO-${confusables(up.slice(5))}`;
  if (/^[0-9A-Z]{4}$/.test(up)) return `NEXO-${confusables(up)}`;
  return up;
}

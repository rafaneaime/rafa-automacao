import { createHmac, timingSafeEqual } from 'node:crypto';

export function signBody(rawBody: string, appSecret: string): string {
  const hex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  return `sha256=${hex}`;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual estoura se os tamanhos diferem; comparar antes é seguro
  // porque o tamanho não é segredo.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header) return false;
  return safeEqual(header, signBody(rawBody, appSecret));
}

export function isValidVerifyToken(received: string | null, expected: string): boolean {
  if (!received) return false;
  return safeEqual(received, expected);
}

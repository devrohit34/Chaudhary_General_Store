import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

function accessSecret() {
  const secret = process.env.ORDER_ACCESS_SECRET;
  if (!secret || secret.length < 32) throw new Error('ORDER_ACCESS_SECRET must be configured with at least 32 characters.');
  return secret;
}

export function createOrderAccessToken(idempotencyKey: string) {
  return createHmac('sha256', accessSecret()).update(`order-access:${idempotencyKey}`).digest('hex');
}

export function hashOrderAccessToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function orderAccessCookieName(orderNumber: string) {
  return `order-access-${orderNumber}`;
}

export function orderAccessCookie(orderNumber: string, token: string) {
  const secure = process.env.NODE_ENV === 'production';
  return `${orderAccessCookieName(orderNumber)}=${encodeURIComponent(token)}; HttpOnly; Path=/api/orders/${encodeURIComponent(orderNumber)}; SameSite=Strict; Max-Age=2592000${secure ? '; Secure' : ''}`;
}

export function requestOrderAccessToken(request: Request, orderNumber: string) {
  const cookiePrefix = `${orderAccessCookieName(orderNumber)}=`;
  const tokenCookie = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookiePrefix))
    ?.slice(cookiePrefix.length);
  const token = request.headers.get('x-order-access-token') || tokenCookie;
  if (!token) return null;
  try {
    return decodeURIComponent(token);
  } catch {
    return null;
  }
}

export function hasOrderAccessToken(token: string | null, tokenHash: string | null) {
  if (!token || !tokenHash) return false;
  const actual = Buffer.from(hashOrderAccessToken(token), 'hex');
  const expected = Buffer.from(tokenHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOrderNumber() {
  return `CGS${randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
}

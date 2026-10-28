import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'customer-session';
const ISSUER = 'chaudhary-general-store-customer';

function signingKey() {
  const secret = process.env.CUSTOMER_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('CUSTOMER_SESSION_SECRET must be configured with at least 32 characters.');
  return new TextEncoder().encode(secret);
}

export async function createCustomerSession(customer: { id: string; email: string }) {
  return new SignJWT({ email: customer.email, role: 'customer' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setSubject(customer.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(signingKey());
}

export async function getCustomerSession(request: Request) {
  const token = request.headers.get('cookie')?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(decodeURIComponent(token), signingKey(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export function customerSessionCookie(token: string) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function clearCustomerSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

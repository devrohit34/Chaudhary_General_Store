import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'chaudhary-general-store-admin';
const AUDIENCE = 'chaudhary-general-store-admin';

function signingKey() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ADMIN_SESSION_SECRET must be configured with at least 32 characters.');
  return new TextEncoder().encode(secret);
}

export async function createAdminSession(email: string, role: string) {
  return new SignJWT({ email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(signingKey());
}

export async function verifyAdminSession(token: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      algorithms: ['HS256'],
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return typeof payload.email === 'string' &&
      (payload.role === 'admin' || payload.role === 'manager')
      ? { email: payload.email, role: payload.role }
      : null;
  } catch {
    return null;
  }
}

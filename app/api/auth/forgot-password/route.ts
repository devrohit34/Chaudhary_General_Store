import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { hasSameOrigin } from '@/lib/request-security';
import { isRateLimited } from '@/lib/rate-limit';
import {
  createPasswordResetToken,
  getResetAppUrl,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MINUTES,
  sendPasswordResetEmail,
} from '@/lib/password-reset';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const parsed = forgotPasswordSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const email = parsed.data.email.toLowerCase();
  if (isRateLimited(`password-reset:${email}`, 3, 60_000)) {
    return NextResponse.json(
      { error: 'Too many password reset requests. Please try again in a few minutes.' },
      { status: 429 }
    );
  }

  const responseMessage = {
    message: 'If an account exists with this email address, a password reset link has been sent.',
  };

  try {
    const customer = await getPrisma().customer.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    if (customer) {
      const token = createPasswordResetToken();
      const tokenHash = hashPasswordResetToken(token);
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60 * 1000);

      await getPrisma().passwordResetToken.deleteMany({
        where: { customerId: customer.id },
      });

      await getPrisma().passwordResetToken.create({
        data: {
          customerId: customer.id,
          tokenHash,
          expiresAt,
        },
      });

      const appUrl = getResetAppUrl();
      const resetUrl = new URL('/account/reset-password', appUrl);
      resetUrl.searchParams.set('token', token);
      await sendPasswordResetEmail({
        email: customer.email,
        resetUrl: resetUrl.toString(),
      });
    }

    return NextResponse.json(responseMessage);
  } catch (error) {
    console.error('Password reset request failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(responseMessage);
  }
}

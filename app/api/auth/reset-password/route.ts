
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clearCustomerSessionCookie } from '@/lib/customer-session';
import { getPrisma } from '@/lib/prisma';
import { hasSameOrigin } from '@/lib/request-security';
import { hashPasswordResetToken } from '@/lib/password-reset';

const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(512),
  password: z.string().min(10).max(72),
  confirmPassword: z.string().min(10).max(72),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) {
    return NextResponse.json(
      { error: 'Invalid request origin.' },
      { status: 403 }
    );
  }

  const parsed = resetPasswordSchema.safeParse(
    await request.json().catch(() => null)
  );

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Use a valid reset token and a matching password.' },
      { status: 400 }
    );
  }

  const tokenHash = hashPasswordResetToken(parsed.data.token);

  try {
    // Hash the password before opening the database transaction.
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);

    const prisma = getPrisma();

    await prisma.$transaction(
      async (tx) => {
        const now = new Date();

        const resetToken = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
        });

        if (
          !resetToken ||
          resetToken.usedAt ||
          resetToken.expiresAt <= now
        ) {
          throw new Error('INVALID_OR_EXPIRED_TOKEN');
        }

        // Atomically claim the token so it cannot be reused.
        const claimedToken = await tx.passwordResetToken.updateMany({
          where: {
            id: resetToken.id,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            usedAt: now,
          },
        });

        if (claimedToken.count !== 1) {
          throw new Error('INVALID_OR_EXPIRED_TOKEN');
        }

        const customer = await tx.customer.findUnique({
          where: { id: resetToken.customerId },
          select: { id: true },
        });

        if (!customer) {
          throw new Error('INVALID_OR_EXPIRED_TOKEN');
        }

        // Update password and revoke old customer sessions.
        await tx.customer.update({
          where: { id: customer.id },
          data: {
            passwordHash,
            sessionVersion: { increment: 1 },
          },
        });

        // Remove all other outstanding reset tokens.
        await tx.passwordResetToken.deleteMany({
          where: {
            customerId: customer.id,
            id: { not: resetToken.id },
          },
        });
      },
      {
        maxWait: 10000,
        timeout: 20000,
      }
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Your password has been updated successfully.',
      },
      {
        headers: {
          'Set-Cookie': clearCustomerSessionCookie(),
        },
      }
    );

  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'INVALID_OR_EXPIRED_TOKEN'
    ) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired.' },
        { status: 400 }
      );
    }

    console.error(
      'Password reset failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      { error: 'We could not reset your password right now. Please try again.' },
      { status: 503 }
    );
  }
}

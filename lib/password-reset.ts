
import { createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';

export const PASSWORD_RESET_TOKEN_TTL_MINUTES = 15;

export function createPasswordResetToken() {
  return randomBytes(32).toString('hex');
}

export function hashPasswordResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function getResetAppUrl() {
  const baseUrl = process.env.APP_URL ?? process.env.APP_BASE_URL;

  if (!baseUrl) {
    throw new Error('APP_URL is not configured.');
  }

  const parsed = new URL(baseUrl);

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('APP_URL must use http or https.');
  }

  return parsed;
}

function createSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');

  if (!host || !user || !pass || !process.env.EMAIL_FROM) {
    throw new Error('Gmail SMTP configuration is incomplete.');
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid SMTP port configuration.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
  });
}

export async function sendPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}): Promise<boolean> {
  try {
    const transporter = createSmtpTransporter();

    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: 'Reset Your Chaudhary General Store Password',
      text: `
We received a request to reset your Chaudhary General Store password.

Open this link to choose a new password:
${resetUrl}

This link expires in 15 minutes.

If you did not request a password reset, you can safely ignore this email.
      `.trim(),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;background:#f8fafc;padding:24px;color:#0f172a;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <div style="background:#159B4A;padding:24px;color:white;text-align:center;">
              <h1 style="margin:0;font-size:26px;">Chaudhary General Store</h1>
            </div>

            <div style="padding:28px 24px;">
              <h2 style="margin-top:0;">Reset your password</h2>

              <p>We received a request to reset the password for your Chaudhary General Store account.</p>

              <p>Click the button below to choose a new password. This link expires in 15 minutes.</p>

              <div style="text-align:center;margin:28px 0;">
                <a
                  href="${resetUrl}"
                  style="display:inline-block;background:#159B4A;color:white;text-decoration:none;font-weight:600;border-radius:8px;padding:14px 24px;"
                >
                  Reset Password
                </a>
              </div>

              <p style="font-size:14px;">If the button does not work, copy and paste this link:</p>

              <p style="font-size:14px;word-break:break-all;">
                <a href="${resetUrl}">${resetUrl}</a>
              </p>

              <p style="font-size:13px;color:#475569;">
                If you did not request a password reset, you can safely ignore this email.
              </p>
            </div>

            <div style="padding:18px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
              Chaudhary General Store
            </div>
          </div>
        </div>
      `,
    });

    await transporter.close();

    console.log('Password reset email sent successfully.');
    return true;
  } catch (error) {
    const smtpError = error as NodeJS.ErrnoException & {
      responseCode?: number;
    };

    console.error('Password reset email delivery failed:', {
      code: smtpError.code || 'UNKNOWN',
      responseCode: smtpError.responseCode || null,
      message: error instanceof Error ? error.message : 'Unknown SMTP error',
    });

    return false;
  }
}

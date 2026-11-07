# Chaudhary General Store - Password Reset Setup

## Email Provider

Password reset emails are sent using Gmail SMTP through Nodemailer.
Resend is not used.

## Required Environment Variables

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-store-email@gmail.com
SMTP_PASS=your-google-app-password
EMAIL_FROM="Chaudhary General Store <your-store-email@gmail.com>"

APP_URL=http://localhost:3000

## Gmail SMTP Setup

1. Create a separate Gmail account for the store.
2. Enable Google 2-Step Verification.
3. Generate a Google App Password.
4. Install Nodemailer dependencies.
5. Add the SMTP environment variables to local .env.local.
6. Keep all credentials private.

Do not use the normal Gmail password.
Use the Google-generated App Password.

## Production Configuration

Configure these variables in Vercel:

- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS
- EMAIL_FROM
- APP_URL

Production APP_URL:

https://chaudharygeneralstore.vercel.app

Use the same verified Gmail sender address for SMTP_USER and EMAIL_FROM.

## Database Migration

Password reset requires the following migration:

20261106010000_customer_password_reset_tokens

Apply pending production migrations using:

npx prisma migrate deploy

Verify migration status using:

npx prisma migrate status

Never use prisma migrate reset on the production database.

## Password Reset Security

- Reset tokens use cryptographically secure random generation.
- Only SHA-256 token hashes are stored.
- Reset links expire after 15 minutes.
- Reset tokens are single-use.
- Passwords are hashed using bcryptjs.
- Existing customer sessions are invalidated after password reset.

## Local Testing

Run:

npm run db:verify
npm run dev

Request a password reset using an existing customer email.

Check the recipient inbox and spam folder.

Complete the password reset and verify login with the new password.

## Production Deployment

1. Configure all SMTP variables in Vercel.
2. Run npm run build.
3. Push approved changes to GitHub.
4. Verify the Vercel production deployment.
5. Test password recovery using a real customer email.

## Security

Never commit .env.local, Gmail App Passwords, SMTP credentials, database credentials, or reset tokens.

.env.example must contain placeholders only.

import './load-env';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { getPrisma } from '../lib/prisma-client';
import { formatSafeError } from './error-message';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(14).max(72),
});

async function main() {
  const parsed = credentialsSchema.safeParse({
    email: process.env.ADMIN_EMAIL,
    name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_INITIAL_PASSWORD,
  });
  if (!parsed.success) {
    throw new Error('Set ADMIN_EMAIL, ADMIN_NAME, and a 14-72 character ADMIN_INITIAL_PASSWORD before provisioning.');
  }

  const email = parsed.data.email.toLowerCase();
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const prisma = getPrisma();
  try {
    await prisma.admin.upsert({
      where: { email },
      create: { email, name: parsed.data.name, passwordHash, role: 'admin', isActive: true },
      update: { name: parsed.data.name, passwordHash, role: 'admin', isActive: true },
    });
    console.log(`Admin account provisioned for ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Admin provisioning failed:', formatSafeError(error));
  process.exitCode = 1;
});

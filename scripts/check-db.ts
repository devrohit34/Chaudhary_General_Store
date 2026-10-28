import './load-env';
import { getPrisma } from '../lib/prisma-client';

async function main() {
  const prisma = getPrisma();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const [categories, products] = await Promise.all([
      prisma.category.count(),
      prisma.product.count(),
    ]);
    console.log(`Neon database connection verified. Catalog: ${categories} categories, ${products} products.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Neon database verification failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
});

import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';

export async function getActiveCustomer(request: Request) {
  const session = await getCustomerSession(request);
  if (!session) return null;

  const customer = await getPrisma().customer.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, isActive: true },
  });
  return customer?.isActive ? { id: customer.id, email: customer.email } : null;
}

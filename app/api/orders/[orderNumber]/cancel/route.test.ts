import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: vi.fn() }));
vi.mock('@/lib/order-access', () => ({
  hasOrderAccessToken: vi.fn(),
  requestOrderAccessToken: vi.fn(),
}));
vi.mock('@/lib/order-cancellation', () => ({
  cancelOrder: vi.fn(),
  OrderCancellationError: class OrderCancellationError extends Error {
    status = 409;
  },
  processRefundOperation: vi.fn(),
}));
vi.mock('@/lib/prisma-dto', () => ({ toOrderDto: vi.fn((order) => order) }));

import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken } from '@/lib/order-access';
import { cancelOrder } from '@/lib/order-cancellation';
import { POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
});

function request(body: unknown, origin = 'https://store.example') {
  return new Request('https://store.example/api/orders/CGS12345678/cancel', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('customer order cancellation authorization', () => {
  it('does not disclose or cancel an order belonging to another customer', async () => {
    vi.mocked(getPrisma).mockReturnValue({
      order: {
        findUnique: vi.fn(async () => ({
          id: 'order-1',
          customerId: 'owner-customer',
          guestAccessTokenHash: 'stored-hash',
        })),
      },
    } as never);
    vi.mocked(getCustomerSession).mockResolvedValue({ id: 'different-customer', email: 'other@example.com' });
    vi.mocked(hasOrderAccessToken).mockReturnValue(false);

    const response = await POST(request({ reason: 'No longer needed' }), {
      params: Promise.resolve({ orderNumber: 'CGS12345678' }),
    });

    expect(response.status).toBe(404);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('rejects invalid guest access tokens', async () => {
    vi.mocked(getPrisma).mockReturnValue({
      order: {
        findUnique: vi.fn(async () => ({
          id: 'guest-order',
          customerId: null,
          guestAccessTokenHash: 'stored-hash',
        })),
      },
    } as never);
    vi.mocked(getCustomerSession).mockResolvedValue(null);
    vi.mocked(hasOrderAccessToken).mockReturnValue(false);

    const response = await POST(request({ reason: 'Ordered by mistake' }), {
      params: Promise.resolve({ orderNumber: 'CGS12345678' }),
    });

    expect(response.status).toBe(404);
    expect(cancelOrder).not.toHaveBeenCalled();
  });

  it('rejects cross-origin cancellation requests', async () => {
    const response = await POST(request({ reason: 'No longer needed' }, 'https://attacker.example'), {
      params: Promise.resolve({ orderNumber: 'CGS12345678' }),
    });

    expect(response.status).toBe(403);
    expect(getPrisma).not.toHaveBeenCalled();
  });
});

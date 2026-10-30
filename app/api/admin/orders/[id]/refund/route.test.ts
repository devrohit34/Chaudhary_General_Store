import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/require-admin', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));

import { requireAdmin } from '@/lib/require-admin';
import { getPrisma } from '@/lib/prisma';
import { POST } from './route';

afterEach(() => {
  vi.clearAllMocks();
});

it('rejects refund actions without an authenticated administrator', async () => {
  vi.mocked(requireAdmin).mockResolvedValue({
    session: null,
    response: new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401 }),
  } as never);
  const request = new Request('https://store.example/api/admin/orders/order-1/refund', {
    method: 'POST',
    headers: { origin: 'https://store.example', 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'process' }),
  });

  const response = await POST(request, { params: Promise.resolve({ id: 'order-1' }) });

  expect(response.status).toBe(401);
  expect(getPrisma).not.toHaveBeenCalled();
});

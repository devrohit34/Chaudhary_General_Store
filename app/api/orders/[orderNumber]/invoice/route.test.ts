import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('@/lib/customer-session', () => ({ getCustomerSession: vi.fn() }));
vi.mock('@/lib/order-access', () => ({
  hasOrderAccessToken: vi.fn(),
  requestOrderAccessToken: vi.fn(),
}));
vi.mock('@/lib/invoice-pdf', () => ({ generateInvoicePdf: vi.fn() }));

import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { generateInvoicePdf } from '@/lib/invoice-pdf';
import { GET } from './route';

const orderNumber = 'CGS1234567890ABCDEF1234';

afterEach(() => {
  vi.clearAllMocks();
});

function request() {
  return new Request(`https://store.example/api/orders/${orderNumber}/invoice`);
}

function mockOrder(customerId: string | null = 'customer-1') {
  vi.mocked(getPrisma).mockReturnValue({
    order: {
      findUnique: vi.fn(async () => ({
        orderNumber,
        customerId,
        guestAccessTokenHash: 'stored-hash',
        customerName: 'Customer',
        customerEmail: null,
        customerPhone: '9876543210',
        addressSnapshot: {},
        paymentMethod: 'cod',
        paymentStatus: 'pending',
        subtotalPaise: 10000,
        discountPaise: 0,
        deliveryChargePaise: 100,
        gstPaise: 0,
        totalPaise: 10100,
        currency: 'INR',
        createdAt: new Date('2026-10-31T00:00:00.000Z'),
        utrNumber: null,
        items: [],
        payments: [],
      })),
    },
  } as never);
}

describe('invoice download authorization', () => {
  it('does not generate or disclose an invoice to a different customer', async () => {
    mockOrder();
    vi.mocked(getCustomerSession).mockResolvedValue({ id: 'another-customer', email: 'other@example.com' });
    vi.mocked(requestOrderAccessToken).mockReturnValue(null);
    vi.mocked(hasOrderAccessToken).mockReturnValue(false);

    const response = await GET(request(), { params: Promise.resolve({ orderNumber }) });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Invoice is unavailable.' });
    expect(generateInvoicePdf).not.toHaveBeenCalled();
  });

  it('allows the customer who owns the order to download the invoice', async () => {
    mockOrder();
    vi.mocked(getCustomerSession).mockResolvedValue({ id: 'customer-1', email: 'owner@example.com' });
    vi.mocked(requestOrderAccessToken).mockReturnValue(null);
    vi.mocked(hasOrderAccessToken).mockReturnValue(false);
    vi.mocked(generateInvoicePdf).mockResolvedValue(Buffer.from('%PDF-test'));

    const response = await GET(request(), { params: Promise.resolve({ orderNumber }) });

    expect(response.status).toBe(200);
    expect(generateInvoicePdf).toHaveBeenCalledOnce();
  });

  it('allows a guest order token and returns a private downloadable PDF', async () => {
    mockOrder(null);
    vi.mocked(getCustomerSession).mockResolvedValue(null);
    vi.mocked(requestOrderAccessToken).mockReturnValue('guest-access-token');
    vi.mocked(hasOrderAccessToken).mockReturnValue(true);
    vi.mocked(generateInvoicePdf).mockResolvedValue(Buffer.from('%PDF-test'));

    const response = await GET(request(), { params: Promise.resolve({ orderNumber }) });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(`invoice-${orderNumber}.pdf`);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe('%PDF-test');
    expect(hasOrderAccessToken).toHaveBeenCalledWith('guest-access-token', 'stored-hash');
  });

  it('rejects invalid order numbers before accessing the database', async () => {
    const response = await GET(request(), { params: Promise.resolve({ orderNumber: 'invalid' }) });

    expect(response.status).toBe(404);
    expect(getPrisma).not.toHaveBeenCalled();
  });
});

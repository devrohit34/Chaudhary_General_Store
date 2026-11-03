import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'crypto';
import {
  canAccessOrder,
  createOrderAccessToken,
  hashOrderAccessToken,
  hasOrderAccessToken,
} from './order-access';
import { safeEqualHex } from './razorpay-server';
import { getCustomerSession } from '@/lib/customer-session';

vi.mock('@/lib/customer-session', () => ({ getCustomerSession: vi.fn() }));

describe('payment and guest-order security helpers', () => {
  afterEach(() => {
    delete process.env.ORDER_ACCESS_SECRET;
    vi.clearAllMocks();
  });

  it('derives deterministic, hashed guest access without storing the raw token', () => {
    process.env.ORDER_ACCESS_SECRET = 'test-secret-with-more-than-thirty-two-characters';
    const token = createOrderAccessToken('checkout-attempt');
    const tokenHash = hashOrderAccessToken(token);
    expect(createOrderAccessToken('checkout-attempt')).toBe(token);
    expect(hasOrderAccessToken(token, tokenHash)).toBe(true);
    expect(hasOrderAccessToken('incorrect-token', tokenHash)).toBe(false);
  });

  it('only allows the authenticated customer or a bearer token for an existing guest order', async () => {
    const request = new Request('https://store.example/api/orders/CGS12345678');
    vi.mocked(getCustomerSession).mockResolvedValue({ id: 'another-customer', email: 'other@example.com' });
    expect(await canAccessOrder(request, 'CGS12345678', {
      customerId: 'owner-customer',
      guestAccessTokenHash: 'stored-hash',
    })).toBe(false);

    vi.mocked(getCustomerSession).mockResolvedValue({ id: 'owner-customer', email: 'owner@example.com' });
    expect(await canAccessOrder(request, 'CGS12345678', {
      customerId: 'owner-customer',
      guestAccessTokenHash: 'stored-hash',
    })).toBe(true);

    process.env.ORDER_ACCESS_SECRET = 'test-secret-with-more-than-thirty-two-characters';
    const token = createOrderAccessToken('legacy-guest-checkout');
    vi.mocked(getCustomerSession).mockResolvedValue(null);
    const guestRequest = new Request('https://store.example/api/orders/CGS12345678', {
      headers: { 'x-order-access-token': token },
    });
    expect(await canAccessOrder(guestRequest, 'CGS12345678', {
      customerId: null,
      guestAccessTokenHash: hashOrderAccessToken(token),
    })).toBe(true);
  });

  it('compares valid hex signatures in constant-time and rejects malformed values', () => {
    const secret = 'razorpay-test-secret';
    const signature = createHmac('sha256', secret).update('gateway-order|gateway-payment').digest('hex');
    const matching = createHmac('sha256', secret).update('gateway-order|gateway-payment').digest('hex');
    const mismatching = createHmac('sha256', secret).update('different').digest('hex');
    expect(safeEqualHex(signature, matching)).toBe(true);
    expect(safeEqualHex(signature, mismatching)).toBe(false);
    expect(safeEqualHex(signature, 'invalid')).toBe(false);
  });
});

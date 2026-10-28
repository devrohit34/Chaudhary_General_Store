import { afterEach, describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  createOrderAccessToken,
  hashOrderAccessToken,
  hasOrderAccessToken,
} from './order-access';
import { safeEqualHex } from './razorpay-server';

describe('payment and guest-order security helpers', () => {
  afterEach(() => {
    delete process.env.ORDER_ACCESS_SECRET;
  });

  it('derives deterministic, hashed guest access without storing the raw token', () => {
    process.env.ORDER_ACCESS_SECRET = 'test-secret-with-more-than-thirty-two-characters';
    const token = createOrderAccessToken('checkout-attempt');
    const tokenHash = hashOrderAccessToken(token);
    expect(createOrderAccessToken('checkout-attempt')).toBe(token);
    expect(hasOrderAccessToken(token, tokenHash)).toBe(true);
    expect(hasOrderAccessToken('incorrect-token', tokenHash)).toBe(false);
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

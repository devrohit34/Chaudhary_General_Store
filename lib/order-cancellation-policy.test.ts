import { describe, expect, it } from 'vitest';
import { CANCELLATION_REASONS, isOrderCancellationEligible } from './order-cancellation-policy';

describe('order cancellation policy', () => {
  it.each(['pending', 'confirmed', 'processing'])('allows cancellation before fulfilment progresses: %s', (status) => {
    expect(isOrderCancellationEligible(status)).toBe(true);
  });

  it.each(['out_for_delivery', 'delivered', 'cancelled', 'returned', 'unknown'])('rejects cancellation after the eligible stages: %s', (status) => {
    expect(isOrderCancellationEligible(status)).toBe(false);
  });

  it('exposes only the supported cancellation reasons', () => {
    expect(CANCELLATION_REASONS).toEqual([
      'Ordered by mistake',
      'Delivery taking too long',
      'Found a better option',
      'No longer needed',
      'Other',
    ]);
  });
});

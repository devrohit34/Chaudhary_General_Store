export const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'processing'] as const;

export function isOrderCancellationEligible(status: string) {
  return CUSTOMER_CANCELLABLE_STATUSES.some((eligibleStatus) => eligibleStatus === status);
}

export const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Delivery taking too long',
  'Found a better option',
  'No longer needed',
  'Other',
] as const;

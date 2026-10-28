export function rupeesToPaise(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Amount must be a non-negative finite number.');
  return Math.round((value + Number.EPSILON) * 100);
}

export function calculateOrderAmounts(subtotalPaise: number, isExpress: boolean) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new RangeError('Subtotal must be a non-negative integer number of paise.');
  }
  const deliveryChargePaise = (subtotalPaise >= 99_900 ? 0 : 6_900) + (isExpress ? 2_000 : 0);
  return {
    subtotalPaise,
    deliveryChargePaise,
    totalPaise: subtotalPaise + deliveryChargePaise,
  };
}

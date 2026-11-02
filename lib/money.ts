const DELIVERY_CHARGE_THRESHOLD_PAISE = 99_900;
const STANDARD_DELIVERY_BELOW_THRESHOLD_PAISE = 3_900;
const STANDARD_DELIVERY_AT_OR_ABOVE_THRESHOLD_PAISE = 1_900;
const EXPRESS_DELIVERY_SURCHARGE_PAISE = 2_000;

export function rupeesToPaise(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('Amount must be a non-negative finite number.');
  return Math.round((value + Number.EPSILON) * 100);
}

export function calculateOrderAmounts(subtotalPaise: number, isExpress: boolean) {
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise < 0) {
    throw new RangeError('Subtotal must be a non-negative integer number of paise.');
  }
  const standardDeliveryChargePaise = subtotalPaise >= DELIVERY_CHARGE_THRESHOLD_PAISE
    ? STANDARD_DELIVERY_AT_OR_ABOVE_THRESHOLD_PAISE
    : STANDARD_DELIVERY_BELOW_THRESHOLD_PAISE;
  const expressDeliveryChargePaise = isExpress ? EXPRESS_DELIVERY_SURCHARGE_PAISE : 0;
  const deliveryChargePaise = standardDeliveryChargePaise + expressDeliveryChargePaise;
  return {
    subtotalPaise,
    standardDeliveryChargePaise,
    expressDeliveryChargePaise,
    deliveryChargePaise,
    totalPaise: subtotalPaise + deliveryChargePaise,
  };
}

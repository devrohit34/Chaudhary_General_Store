import { describe, expect, it } from 'vitest';
import { calculateOrderAmounts, rupeesToPaise } from './money';

describe('money helpers', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
  });

  it('applies the free-delivery threshold and express fee', () => {
    expect(calculateOrderAmounts(99_900, false)).toEqual({
      subtotalPaise: 99_900,
      deliveryChargePaise: 0,
      totalPaise: 99_900,
    });
    expect(calculateOrderAmounts(99_899, true)).toEqual({
      subtotalPaise: 99_899,
      deliveryChargePaise: 8_900,
      totalPaise: 108_799,
    });
  });

  it('rejects invalid monetary inputs', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => calculateOrderAmounts(1.5, false)).toThrow(RangeError);
  });
});

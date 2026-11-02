import { describe, expect, it } from 'vitest';
import { calculateOrderAmounts, rupeesToPaise } from './money';

describe('money helpers', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(19.99)).toBe(1999);
  });

  it('applies standard and express delivery charges at each pricing boundary', () => {
    const cases = [
      { subtotalRupees: 500, standardRupees: 39 },
      { subtotalRupees: 900, standardRupees: 39 },
      { subtotalRupees: 998, standardRupees: 39 },
      { subtotalRupees: 999, standardRupees: 19 },
      { subtotalRupees: 1000, standardRupees: 19 },
      { subtotalRupees: 1500, standardRupees: 19 },
    ];

    for (const { subtotalRupees, standardRupees } of cases) {
      const subtotalPaise = rupeesToPaise(subtotalRupees);
      const standardChargePaise = rupeesToPaise(standardRupees);
      const expressSurchargePaise = rupeesToPaise(20);

      expect(calculateOrderAmounts(subtotalPaise, false)).toEqual({
        subtotalPaise,
        standardDeliveryChargePaise: standardChargePaise,
        expressDeliveryChargePaise: 0,
        deliveryChargePaise: standardChargePaise,
        totalPaise: subtotalPaise + standardChargePaise,
      });
      expect(calculateOrderAmounts(subtotalPaise, true)).toEqual({
        subtotalPaise,
        standardDeliveryChargePaise: standardChargePaise,
        expressDeliveryChargePaise: expressSurchargePaise,
        deliveryChargePaise: standardChargePaise + expressSurchargePaise,
        totalPaise: subtotalPaise + standardChargePaise + expressSurchargePaise,
      });
    }
  });

  it('rejects invalid monetary inputs', () => {
    expect(() => rupeesToPaise(Number.NaN)).toThrow(RangeError);
    expect(() => calculateOrderAmounts(1.5, false)).toThrow(RangeError);
  });
});

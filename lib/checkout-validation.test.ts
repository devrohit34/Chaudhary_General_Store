import { describe, expect, it } from 'vitest';
import { checkoutSchema } from './checkout-validation';

const validCheckout = {
  address: {
    full_name: 'Store Customer',
    phone: '9876543210',
    address_line1: '12 Market Road',
    city: 'Bhagwanpur',
    state: 'Bihar',
    pincode: '844114',
  },
  items: [{ product_id: 'p_1', quantity: 2 }],
};

describe('checkout validation', () => {
  it('accepts a valid address and product-id/quantity cart', () => {
    expect(checkoutSchema.safeParse(validCheckout).success).toBe(true);
  });

  it('rejects invalid quantities and missing delivery details', () => {
    expect(checkoutSchema.safeParse({
      ...validCheckout,
      items: [{ product_id: 'p_1', quantity: 0 }],
    }).success).toBe(false);
    expect(checkoutSchema.safeParse({
      ...validCheckout,
      address: { ...validCheckout.address, pincode: 'x' },
    }).success).toBe(false);
  });
});

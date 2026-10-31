import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { generateInvoicePdf, type InvoiceOrder } from './invoice-pdf';

function invoiceOrder(overrides: Partial<InvoiceOrder> = {}): InvoiceOrder {
  return {
    orderNumber: 'CGS1234567890ABCDEF12',
    customerName: 'Test Customer',
    customerEmail: null,
    customerPhone: '9876543210',
    addressSnapshot: {
      full_name: 'Test Customer',
      phone: '9876543210',
      address_line1: 'Village Mauza',
      city: 'Bhagwanpur',
      state: 'Bihar',
      pincode: '844114',
    },
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
    items: [{
      productName: 'Rice',
      brand: null,
      unit: '1 kg',
      unitPricePaise: 10000,
      quantity: 1,
      lineTotalPaise: 10000,
    }],
    payments: [],
    ...overrides,
  };
}

function pageCount(pdf: Buffer) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length;
}

describe('invoice PDF generation', () => {
  it('creates a downloadable PDF for an unpaid COD order', async () => {
    const pdf = await generateInvoicePdf(invoiceOrder({
      items: Array.from({ length: 5 }, (_, index) => ({
        productName: `Grocery product ${index + 1}`,
        brand: 'Store brand',
        unit: '1 kg',
        unitPricePaise: 10000,
        quantity: 1,
        lineTotalPaise: 10000,
      })),
    }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pageCount(pdf)).toBe(1);
  });

  it('supports verified payment references and multiple pages of long item names', async () => {
    const pdf = await generateInvoicePdf(invoiceOrder({
      paymentMethod: 'razorpay',
      paymentStatus: 'paid',
      payments: [{
        gatewayPaymentId: 'pay_verified_reference',
        capturedAt: new Date('2026-10-31T01:00:00.000Z'),
        verifiedAt: new Date('2026-10-31T01:00:00.000Z'),
      }],
      items: Array.from({ length: 60 }, (_, index) => ({
        productName: `Long grocery product name ${index + 1} `.repeat(8),
        brand: 'Store brand',
        unit: '1 pack',
        unitPricePaise: 10000,
        quantity: 1,
        lineTotalPaise: 10000,
      })),
    }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(10);
  });

  it('creates an invoice for a pending prepaid order without a payment reference', async () => {
    const pdf = await generateInvoicePdf(invoiceOrder({
      paymentMethod: 'razorpay',
      paymentStatus: 'pending',
      payments: [{ gatewayPaymentId: null, capturedAt: null, verifiedAt: null }],
    }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('generates a valid invoice when optional customer and product image data is absent', async () => {
    const pdf = await generateInvoicePdf(invoiceOrder({
      customerEmail: null,
      addressSnapshot: {},
      items: [{
        productName: 'Product without a catalogue image',
        brand: null,
        unit: null,
        unitPricePaise: 10000,
        quantity: 1,
        lineTotalPaise: 10000,
      }],
    }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

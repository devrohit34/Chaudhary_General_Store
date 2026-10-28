import { z } from 'zod';

export const addressSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{8,20}$/),
  address_line1: z.string().trim().min(3).max(240),
  address_line2: z.string().trim().max(240).optional().default(''),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().regex(/^[0-9A-Za-z -]{4,12}$/),
  landmark: z.string().trim().max(160).optional(),
});

export const checkoutSchema = z.object({
  address: addressSchema,
  deliverySlot: z.string().trim().max(120).optional().default(''),
  isExpress: z.boolean().default(false),
  items: z.array(z.object({
    product_id: z.string().trim().min(1).max(64),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

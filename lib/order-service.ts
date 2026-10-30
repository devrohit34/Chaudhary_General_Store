import 'server-only';
import { randomInt } from 'crypto';
import { getPrisma } from '@/lib/prisma';
import { calculateOrderAmounts } from '@/lib/money';
import { createOrderAccessToken, createOrderNumber, hashOrderAccessToken } from '@/lib/order-access';
import type { CheckoutInput } from '@/lib/checkout-validation';
import type { PaymentMethod } from '@/generated/prisma/client';
import type { Prisma } from '@/generated/prisma/client';

export class CheckoutError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'CheckoutError';
  }
}

export async function createCheckoutOrder(
  input: CheckoutInput,
  paymentMethod: PaymentMethod,
  idempotencyKey: string,
  customer?: { id: string; email: string }
) {
  const prisma = getPrisma();
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: { items: true, payments: true },
  });
  if (existing) {
    if (existing.paymentStatus === 'failed' || existing.status === 'cancelled') {
      throw new CheckoutError('This checkout attempt has expired. Start a new checkout.', 409);
    }
    return {
      order: existing,
      orderAccessToken: createOrderAccessToken(idempotencyKey),
      alreadyExists: true,
    };
  }

  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.product_id, (quantities.get(item.product_id) ?? 0) + item.quantity);
  }
  if (quantities.size > 50 || [...quantities.values()].some((quantity) => quantity > 100)) {
    throw new CheckoutError('One or more cart quantities are outside the allowed range.');
  }

  const productIds = [...quantities.keys()];
  const orderNumber = createOrderNumber();
  const orderAccessToken = createOrderAccessToken(idempotencyKey);
  const accessTokenHash = hashOrderAccessToken(orderAccessToken);

  try {
    const order = await prisma.$transaction(async (transaction) => {
      const products = await transaction.product.findMany({
        where: { id: { in: productIds }, isActive: true },
      });
      if (products.length !== productIds.length) {
        throw new CheckoutError('A product is no longer available. Refresh your cart.');
      }

      const productMap = new Map(products.map((product) => [product.id, product]));
      let subtotalPaise = 0;
      const orderItems = productIds.map((productId) => {
        const quantity = quantities.get(productId)!;
        const product = productMap.get(productId);
        if (!product) throw new CheckoutError('A product is no longer available. Refresh your cart.');
        if (quantity > product.stockQuantity) {
          throw new CheckoutError(`${product.name} does not have enough stock.`);
        }
        subtotalPaise += product.pricePaise * quantity;
        return {
          productId: product.id,
          productName: product.name,
          productImage: product.imageUrl,
          brand: product.brand,
          unit: product.unit,
          unitPricePaise: product.pricePaise,
          lineTotalPaise: product.pricePaise * quantity,
          quantity,
          gstBasisPoints: product.gstBasisPoints,
        };
      });

      const totals = calculateOrderAmounts(subtotalPaise, input.isExpress);
      if (totals.totalPaise <= 0 || totals.totalPaise > 50_000_000) {
        throw new CheckoutError('Order amount is outside the supported range.');
      }

      for (const item of orderItems) {
        const reserved = await transaction.product.updateMany({
          where: { id: item.productId!, isActive: true, stockQuantity: { gte: item.quantity } },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        if (reserved.count !== 1) {
          throw new CheckoutError(`${item.productName} just sold out. Refresh your cart.`);
        }
      }

      return transaction.order.create({
        data: {
          orderNumber,
          customerId: customer?.id,
          customerName: input.address.full_name,
          customerEmail: customer?.email,
          customerPhone: input.address.phone,
          addressSnapshot: input.address,
          status: 'pending',
          paymentMethod,
          paymentStatus: paymentMethod === 'upi' || paymentMethod === 'phonepe' ||
            paymentMethod === 'googlepay' || paymentMethod === 'paytm'
            ? 'pending_verification'
            : 'pending',
          subtotalPaise: totals.subtotalPaise,
          deliveryChargePaise: totals.deliveryChargePaise,
          totalPaise: totals.totalPaise,
          deliverySlot: input.deliverySlot,
          deliveryOtp: String(randomInt(1000, 10000)),
          isExpress: input.isExpress,
          qrCreatedAt: paymentMethod === 'upi' || paymentMethod === 'phonepe' ||
            paymentMethod === 'googlepay' || paymentMethod === 'paytm'
            ? new Date()
            : null,
          idempotencyKey,
          guestAccessTokenHash: accessTokenHash,
          items: { create: orderItems },
          ...(paymentMethod === 'razorpay'
            ? { payments: { create: { gateway: 'razorpay', status: 'pending', amountPaise: totals.totalPaise } } }
            : paymentMethod === 'upi' || paymentMethod === 'phonepe' ||
              paymentMethod === 'googlepay' || paymentMethod === 'paytm'
              ? { payments: { create: { gateway: 'manual_upi', status: 'pending_verification', amountPaise: totals.totalPaise } } }
            : {}),
        },
        include: { items: true, payments: true },
      });
    }, { isolationLevel: 'Serializable' });

    return { order, orderAccessToken, alreadyExists: false };
  } catch (error) {
    if (error instanceof CheckoutError) throw error;
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      const retryOrder = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { items: true, payments: true },
      });
      if (retryOrder) return { order: retryOrder, orderAccessToken, alreadyExists: true };
    }
    throw error;
  }
}

export async function releaseOrderInventory(orderId: string) {
  const prisma = getPrisma();
  await prisma.$transaction(
    (transaction) => releaseOrderInventoryInTransaction(transaction, orderId),
    { isolationLevel: 'Serializable' }
  );
}

export async function releaseOrderInventoryInTransaction(transaction: Prisma.TransactionClient, orderId: string) {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.inventoryReleased || order.paymentStatus === 'paid') return;

  for (const item of order.items) {
    if (item.productId) {
      await transaction.product.updateMany({
        where: { id: item.productId },
        data: { stockQuantity: { increment: item.quantity } },
      });
    }
  }
  await transaction.order.updateMany({
    where: { id: order.id, inventoryReleased: false },
    data: { inventoryReleased: true },
  });
}

import 'server-only';
import type { Prisma } from '../generated/prisma/client';
import { getPrisma } from './prisma';
import { getRazorpayConfig, razorpayAuth } from './razorpay-server';
import { isOrderCancellationEligible } from './order-cancellation-policy';

export class OrderCancellationError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = 'OrderCancellationError';
  }
}

export async function cancelOrder(orderId: string, actor: string, reason: string) {
  const prisma = getPrisma();
  return prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: orderId },
      include: { items: true, payments: true, refundOperation: true },
    });
    if (!order) throw new OrderCancellationError('Order not found.', 404);
    if (!isOrderCancellationEligible(order.status)) {
      throw new OrderCancellationError('This order can no longer be cancelled online.');
    }

    const now = new Date();
    const changed = await transaction.order.updateMany({
      where: {
        id: order.id,
        status: { in: ['pending', 'confirmed', 'processing'] },
      },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancellationReason: reason,
        cancellationActor: actor,
        cancellationPreviousStatus: order.status,
        ...(!order.inventoryReleased ? { inventoryReleased: true } : {}),
      },
    });
    if (changed.count !== 1) {
      throw new OrderCancellationError('The order changed before cancellation could be completed. Refresh and try again.');
    }

    if (!order.inventoryReleased) {
      for (const item of order.items) {
        if (item.productId) {
          await transaction.product.updateMany({
            where: { id: item.productId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
      }
    }

    const razorpayPayment = order.payments.find((payment) => payment.gateway === 'razorpay');
    const verifiedCapture = razorpayPayment?.status === 'paid' &&
      Boolean(razorpayPayment.gatewayPaymentId) &&
      razorpayPayment.capturedAt !== null &&
      razorpayPayment.amountPaise === order.totalPaise &&
      razorpayPayment.currency === order.currency;
    const paymentStatus = verifiedCapture
      ? 'pending'
      : order.paymentStatus === 'paid' || razorpayPayment?.status === 'paid'
        ? 'requires_review'
        : order.paymentStatus === 'failed' || order.paymentStatus === 'cancelled' ||
            order.paymentStatus === 'refunded' || razorpayPayment?.status === 'failed' ||
            razorpayPayment?.status === 'cancelled' || razorpayPayment?.status === 'refunded'
          ? 'not_applicable'
          : order.paymentMethod === 'razorpay' || Boolean(razorpayPayment)
            ? 'requires_review'
            : 'not_applicable';

    let refundOperationId = order.refundOperation?.id ?? null;
    if (!order.refundOperation && paymentStatus !== 'not_applicable') {
      const refundOperation = await transaction.refundOperation.create({
        data: {
          orderId: order.id,
          gateway: verifiedCapture || razorpayPayment ? 'razorpay' : order.paymentMethod === 'razorpay' ? 'razorpay' : 'manual',
          gatewayPaymentId: verifiedCapture ? razorpayPayment?.gatewayPaymentId : null,
          amountPaise: order.totalPaise,
          status: paymentStatus,
          ...(paymentStatus === 'requires_review'
            ? { lastError: 'Payment state needs reconciliation before a refund can be safely submitted.' }
            : {}),
        },
      });
      refundOperationId = refundOperation.id;
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      refundOperationId,
      refundStatus: paymentStatus,
    };
  }, { isolationLevel: 'Serializable' });
}

export async function prepareRefundForCapturedPayment(
  transaction: Prisma.TransactionClient,
  orderId: string,
  paymentId: string,
  amountPaise: number
) {
  const order = await transaction.order.findUnique({
    where: { id: orderId },
    include: { refundOperation: true },
  });
  if (!order || order.status !== 'cancelled') return null;

  const current = order.refundOperation;
  if (current) {
    if (current.status === 'completed' || current.status === 'processing' || current.status === 'failed') {
      return current.id;
    }
    await transaction.refundOperation.update({
      where: { id: current.id },
      data: {
        gateway: 'razorpay',
        gatewayPaymentId: paymentId,
        amountPaise,
        ...(current.attemptCount === 0
          ? { status: 'pending' as const, lastError: null }
          : { status: 'requires_review' as const }),
      },
    });
    return current.id;
  }

  const operation = await transaction.refundOperation.create({
    data: {
      orderId,
      gateway: 'razorpay',
      gatewayPaymentId: paymentId,
      amountPaise,
      status: 'pending',
    },
  });
  return operation.id;
}

export async function markRefundNotApplicable(transaction: Prisma.TransactionClient, orderId: string) {
  await transaction.refundOperation.updateMany({
    where: { orderId, status: 'requires_review' },
    data: {
      status: 'not_applicable',
      lastError: null,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function processRefundOperation(operationId: string) {
  const prisma = getPrisma();
  const operation = await prisma.refundOperation.findUnique({ where: { id: operationId } });
  if (!operation || operation.status !== 'pending') return operation;
  const operationWithOrder = await prisma.refundOperation.findUnique({
    where: { id: operation.id },
    include: { order: { select: { currency: true, status: true } } },
  });
  if (!operationWithOrder || operationWithOrder.order.status !== 'cancelled') {
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'pending' },
      data: {
        status: 'requires_review',
        lastError: 'The order state must be reviewed before a refund can be submitted.',
      },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }
  if (!operation.gatewayPaymentId || operation.gateway !== 'razorpay') {
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'pending' },
      data: {
        status: 'requires_review',
        lastError: 'A verified Razorpay payment reference is not available.',
      },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }

  const claim = await prisma.refundOperation.updateMany({
    where: { id: operation.id, status: 'pending' },
    data: {
      status: 'processing',
      attemptCount: { increment: 1 },
      lastAttemptAt: new Date(),
      lastError: null,
    },
  });
  if (claim.count !== 1) return prisma.refundOperation.findUnique({ where: { id: operation.id } });

  let keyId: string;
  let keySecret: string;
  try {
    ({ keyId, keySecret } = getRazorpayConfig());
  } catch {
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'processing' },
      data: { status: 'requires_review', lastError: 'Razorpay is not configured for refund processing.' },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(operation.gatewayPaymentId)}/refund`, {
      method: 'POST',
      headers: {
        Authorization: razorpayAuth(keyId, keySecret),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: operation.amountPaise,
        notes: { refund_operation_id: operation.id },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    payload = await response.json().catch(() => null);
  } catch {
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'processing' },
      data: {
        status: 'requires_review',
        lastError: 'The refund request outcome is uncertain; reconcile with Razorpay before retrying.',
      },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }

  if (!response.ok) {
    const uncertain = response.status === 429 || response.status >= 500;
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'processing' },
      data: {
        status: uncertain ? 'requires_review' : 'failed',
        lastError: uncertain
          ? 'Razorpay returned an uncertain response; reconcile before retrying.'
          : 'Razorpay rejected the refund request.',
      },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }

  const refund = isRecord(payload) ? payload : null;
  const refundId = typeof refund?.id === 'string' ? refund.id : null;
  const refundStatus = refund?.status;
  if (
    !refundId ||
    refund?.payment_id !== operation.gatewayPaymentId ||
    Number(refund?.amount) !== operation.amountPaise ||
    refund?.currency !== operationWithOrder.order.currency ||
    !['pending', 'processed', 'failed'].includes(String(refundStatus))
  ) {
    await prisma.refundOperation.updateMany({
      where: { id: operation.id, status: 'processing' },
      data: {
        status: 'requires_review',
        lastError: 'Razorpay returned an incomplete refund response; reconcile before retrying.',
      },
    });
    return prisma.refundOperation.findUnique({ where: { id: operation.id } });
  }

  const status = refundStatus === 'processed' ? 'completed' : refundStatus === 'failed' ? 'failed' : 'processing';
  await prisma.$transaction(async (transaction) => {
    const saved = await transaction.refundOperation.updateMany({
      where: { id: operation.id, status: 'processing' },
      data: { status, gatewayRefundId: refundId, lastError: null },
    });
    if (saved.count !== 1 || status !== 'completed') return;
    await transaction.payment.updateMany({
      where: {
        orderId: operation.orderId,
        gateway: 'razorpay',
        gatewayPaymentId: operation.gatewayPaymentId,
        status: 'paid',
      },
      data: { status: 'refunded' },
    });
    await transaction.order.updateMany({
      where: { id: operation.orderId, status: 'cancelled' },
      data: { paymentStatus: 'refunded' },
    });
  });
  return prisma.refundOperation.findUnique({ where: { id: operation.id } });
}

export async function recordRefundWebhook(
  transaction: Prisma.TransactionClient,
  details: { paymentId: string; refundId: string; amountPaise: number; currency: string; status: string }
) {
  const operation = await transaction.refundOperation.findFirst({
    where: {
      gateway: 'razorpay',
      gatewayPaymentId: details.paymentId,
    },
    include: { order: { select: { currency: true, status: true } } },
  });
  if (
    !operation ||
    operation.amountPaise !== details.amountPaise ||
    operation.order.currency !== details.currency ||
    operation.order.status !== 'cancelled'
  ) return null;
  if (operation.status === 'completed') return operation.id;

  const status = details.status === 'processed'
    ? 'completed'
    : details.status === 'failed'
      ? 'failed'
      : 'processing';
  if (
    (operation.status === 'failed' && status !== 'completed') ||
    (operation.status === 'requires_review' && status === 'processing')
  ) {
    return operation.id;
  }
  await transaction.refundOperation.update({
    where: { id: operation.id },
    data: {
      gatewayRefundId: details.refundId,
      status,
      lastError: status === 'failed' ? 'Razorpay reported that the refund failed.' : null,
    },
  });
  if (status === 'completed') {
    await transaction.payment.updateMany({
      where: {
        orderId: operation.orderId,
        gateway: 'razorpay',
        gatewayPaymentId: details.paymentId,
        status: 'paid',
      },
      data: { status: 'refunded' },
    });
    await transaction.order.updateMany({
      where: { id: operation.orderId, status: 'cancelled' },
      data: { paymentStatus: 'refunded' },
    });
  }
  return operation.id;
}

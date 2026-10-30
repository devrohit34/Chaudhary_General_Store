import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { getRazorpayConfig, razorpayAuth } from '@/lib/razorpay-server';
import { requireAdmin } from '@/lib/require-admin';
import { processRefundOperation } from '@/lib/order-cancellation';

export const runtime = 'nodejs';

const requestSchema = z.object({
  action: z.enum(['process', 'reconcile', 'retry']),
  confirmNoProviderRefund: z.boolean().optional(),
}).refine((value) => value.action !== 'retry' || value.confirmNoProviderRefund === true, {
  message: 'Confirm that no refund exists in the Razorpay dashboard before retrying.',
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid refund reconciliation action.' }, { status: 400 });

  try {
    const { id } = await params;
    const prisma = getPrisma();
    const operation = await prisma.refundOperation.findUnique({
      where: { orderId: id },
      include: { order: { select: { currency: true } } },
    });
    if (!operation) return NextResponse.json({ error: 'No refund operation exists for this order.' }, { status: 404 });
    if (parsed.data.action === 'process') {
      if (operation.status !== 'pending') {
        return NextResponse.json({ error: 'Only a not-yet-submitted refund can be processed here.' }, { status: 409 });
      }
      const processed = await processRefundOperation(operation.id);
      return NextResponse.json({ refundStatus: processed?.status ?? operation.status });
    }
    if (!operation.gatewayPaymentId || operation.gateway !== 'razorpay') {
      return NextResponse.json({ error: 'This refund requires manual payment-provider review.' }, { status: 409 });
    }

    const { keyId, keySecret } = getRazorpayConfig();
    const path = operation.gatewayRefundId
      ? `/v1/refunds/${encodeURIComponent(operation.gatewayRefundId)}`
      : `/v1/payments/${encodeURIComponent(operation.gatewayPaymentId)}/refunds`;
    const response = await fetch(`https://api.razorpay.com${path}`, {
      headers: { Authorization: razorpayAuth(keyId, keySecret) },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(payload)) {
      return NextResponse.json({ error: 'Refund status is temporarily unavailable from Razorpay.' }, { status: 503 });
    }

    const candidates = operation.gatewayRefundId
      ? [payload]
      : Array.isArray(payload.items) ? payload.items.filter(isRecord) : [];
    const relatedRefunds = candidates.filter((candidate) =>
      candidate.payment_id === operation.gatewayPaymentId &&
      typeof candidate.id === 'string'
    );
    const matchingRefund = relatedRefunds.find((candidate) =>
      Number(candidate.amount) === operation.amountPaise &&
      candidate.currency === operation.order.currency
    );
    if (!matchingRefund) {
      if (relatedRefunds.length > 0) {
        await prisma.refundOperation.updateMany({
          where: { id: operation.id, status: { not: 'completed' } },
          data: {
            status: 'requires_review',
            lastError: 'Razorpay reported a refund with a different amount; manual reconciliation is required.',
          },
        });
        return NextResponse.json({
          error: 'Razorpay has a refund with a different amount. Manual reconciliation is required; no retry was sent.',
          refundStatus: 'requires_review',
        }, { status: 409 });
      }
      if (parsed.data.action === 'retry') {
        if (!['failed', 'requires_review'].includes(operation.status) || operation.attemptCount >= 3) {
          return NextResponse.json({ error: 'This refund is not eligible for retry.' }, { status: 409 });
        }
        const reset = await prisma.refundOperation.updateMany({
          where: { id: operation.id, status: operation.status, gatewayRefundId: null },
          data: { status: 'pending', lastError: null },
        });
        if (reset.count !== 1) {
          return NextResponse.json({ error: 'Refund state changed. Refresh and reconcile before retrying.' }, { status: 409 });
        }
        const retried = await processRefundOperation(operation.id);
        return NextResponse.json({ refundStatus: retried?.status ?? 'pending' });
      }
      return NextResponse.json({
        refundStatus: operation.status,
        message: 'No matching refund was found. The operation remains on hold; review Razorpay before any retry.',
      });
    }

    const providerStatus = matchingRefund.status;
    if (!['pending', 'created', 'processed', 'failed'].includes(String(providerStatus))) {
      return NextResponse.json({ error: 'Razorpay returned an unrecognized refund status.' }, { status: 503 });
    }
    const status = providerStatus === 'processed'
      ? 'completed'
      : providerStatus === 'failed'
        ? 'failed'
        : 'processing';

    await prisma.$transaction(async (transaction) => {
      const current = await transaction.refundOperation.findUnique({ where: { id: operation.id } });
      if (!current || current.status === 'completed') return;
      await transaction.refundOperation.update({
        where: { id: operation.id },
        data: {
          gatewayRefundId: String(matchingRefund.id),
          status,
          lastError: status === 'failed' ? 'Razorpay reported that the refund failed.' : null,
        },
      });
      if (status === 'completed') {
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
      }
    });

    const updated = await prisma.refundOperation.findUnique({ where: { id: operation.id } });
    return NextResponse.json({
      refundStatus: updated?.status ?? operation.status,
      refundReference: updated?.gatewayRefundId ?? operation.gatewayRefundId,
    });
  } catch (error) {
    console.error('Refund reconciliation failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Refund status could not be reconciled right now.' }, { status: 503 });
  }
}

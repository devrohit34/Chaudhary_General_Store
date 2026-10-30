import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { requireAdmin } from '@/lib/require-admin';
import { hasSameOrigin } from '@/lib/request-security';

const utrSchema = z.string().trim().min(6).max(30).regex(/^[a-zA-Z0-9]+$/);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function hasValidImageSignature(type: string, bytes: Buffer) {
  if (type === 'image/jpeg') return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return type === 'image/webp' && bytes.length > 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

async function getAuthorizedOrder(request: Request, orderNumber: string) {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) return { order: null, response: NextResponse.json({ error: 'Order not found.' }, { status: 404 }) };

  const session = await getCustomerSession(request);
  const guestAccess = hasOrderAccessToken(
    requestOrderAccessToken(request, orderNumber),
    order.guestAccessTokenHash
  );
  if (!guestAccess && session?.id !== order.customerId) {
    return { order, response: NextResponse.json({ error: 'Order access is not authorized.' }, { status: 403 }) };
  }
  return { order, response: null };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  if (!hasSameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  try {
    const { orderNumber } = await params;
    const access = await getAuthorizedOrder(request, orderNumber);
    if (access.response) return access.response;
    const order = access.order;
    if (!order) return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    if (
      order.status === 'cancelled' ||
      !['upi', 'phonepe', 'googlepay', 'paytm'].includes(order.paymentMethod) ||
      !['pending_verification', 'rejected'].includes(order.paymentStatus) ||
      order.upiVerifiedAt
    ) {
      return NextResponse.json({ error: 'Payment details cannot be changed for this order.' }, { status: 409 });
    }

    const form = await request.formData();
    const utr = utrSchema.safeParse(form.get('utrNumber'));
    const file = form.get('screenshot');
    if (!utr.success || !(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Provide a valid UTR and an image under 5 MB.' }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    if (!hasValidImageSignature(file.type, bytes)) {
      return NextResponse.json({ error: 'The uploaded file is not a supported image.' }, { status: 400 });
    }

    const prisma = getPrisma();
    const url = `/api/orders/${encodeURIComponent(orderNumber)}/payment-details`;
    await prisma.$transaction(async (transaction) => {
      await transaction.paymentAttachment.deleteMany({ where: { orderNumber } });
      await transaction.paymentAttachment.create({
        data: {
          orderNumber,
          fileName: file.name.slice(0, 160),
          mimeType: file.type,
          data: bytes,
        },
      });
      await transaction.order.update({
        where: { id: order.id },
        data: {
          utrNumber: utr.data,
          paymentScreenshotUrl: url,
          paymentStatus: 'pending_verification',
          upiRejectedReason: null,
        },
      });
      await transaction.payment.updateMany({
        where: { orderId: order.id, gateway: 'manual_upi', status: 'rejected' },
        data: { status: 'pending_verification' },
      });
    });

    return NextResponse.json({ success: true, paymentScreenshotUrl: url });
  } catch (error) {
    console.error('Manual payment submission failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Payment details could not be submitted.' }, { status: 503 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const { orderNumber } = await params;
    const access = await getAuthorizedOrder(request, orderNumber);
    if (access.response) {
      const admin = await requireAdmin(request);
      if (admin.response) return access.response;
    }
    const attachment = await getPrisma().paymentAttachment.findFirst({
      where: { orderNumber },
      orderBy: { createdAt: 'desc' },
    });
    if (!attachment) return NextResponse.json({ error: 'Payment screenshot not found.' }, { status: 404 });
    return new NextResponse(attachment.data, {
      headers: {
        'Content-Type': attachment.mimeType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Payment screenshot retrieval failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Payment screenshot is temporarily unavailable.' }, { status: 503 });
  }
}

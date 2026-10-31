import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/prisma';
import { getCustomerSession } from '@/lib/customer-session';
import { hasOrderAccessToken, requestOrderAccessToken } from '@/lib/order-access';
import { generateInvoicePdf } from '@/lib/invoice-pdf';

export const runtime = 'nodejs';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderNumber: string }> }
) {
  try {
    const { orderNumber } = await params;
    if (!/^CGS[A-F0-9]{20}$/.test(orderNumber)) {
      return NextResponse.json({ error: 'Invoice is unavailable.' }, { status: 404 });
    }

    const order = await getPrisma().order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        customerId: true,
        guestAccessTokenHash: true,
        customerName: true,
        customerEmail: true,
        customerPhone: true,
        addressSnapshot: true,
        paymentMethod: true,
        paymentStatus: true,
        subtotalPaise: true,
        discountPaise: true,
        deliveryChargePaise: true,
        gstPaise: true,
        totalPaise: true,
        currency: true,
        createdAt: true,
        utrNumber: true,
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            productName: true,
            brand: true,
            unit: true,
            unitPricePaise: true,
            quantity: true,
            lineTotalPaise: true,
          },
        },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            gatewayPaymentId: true,
            capturedAt: true,
            verifiedAt: true,
          },
        },
      },
    });

    if (!order) return NextResponse.json({ error: 'Invoice is unavailable.' }, { status: 404 });

    const session = await getCustomerSession(request);
    const guestAccessAllowed = hasOrderAccessToken(
      requestOrderAccessToken(request, orderNumber),
      order.guestAccessTokenHash
    );
    if (!guestAccessAllowed && session?.id !== order.customerId) {
      return NextResponse.json({ error: 'Invoice is unavailable.' }, { status: 404 });
    }

    const pdf = await generateInvoicePdf(order);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${order.orderNumber}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Invoice generation failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Invoice could not be generated. Please try again.' }, { status: 503 });
  }
}

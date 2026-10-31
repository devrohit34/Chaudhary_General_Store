import 'server-only';
import { existsSync } from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

type InvoiceItem = {
  productName: string;
  brand: string | null;
  unit: string | null;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
};

type InvoicePayment = {
  gatewayPaymentId: string | null;
  capturedAt: Date | null;
  verifiedAt: Date | null;
};

export type InvoiceOrder = {
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  addressSnapshot: unknown;
  paymentMethod: string;
  paymentStatus: string;
  subtotalPaise: number;
  discountPaise: number;
  deliveryChargePaise: number;
  gstPaise: number;
  totalPaise: number;
  currency: string;
  createdAt: Date;
  utrNumber: string | null;
  items: InvoiceItem[];
  payments: InvoicePayment[];
};

type Address = Record<string, unknown>;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const PDF_BOTTOM_MARGIN = 10;
const PAGE_BOTTOM = PAGE_HEIGHT - 48;
const NAVY = '#17324D';
const BLUE = '#2B6D9A';
const TEXT = '#263746';
const MUTED = '#657786';
const BORDER = '#D8E0E7';
const ROW_ALT = '#F6F8FA';
const devanagariFont = path.join(
  process.cwd(),
  'public',
  'fonts',
  'noto-sans-devanagari.woff'
);

function record(value: unknown): Address {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Address
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function money(paise: number) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function date(value: Date) {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function paymentLabel(method: string) {
  const labels: Record<string, string> = {
    cod: 'Cash on Delivery',
    upi: 'UPI',
    phonepe: 'PhonePe',
    googlepay: 'Google Pay',
    paytm: 'Paytm',
    card: 'Card',
    razorpay: 'Razorpay',
  };
  return labels[method] ?? method.replace(/_/g, ' ');
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function drawMoney(
  doc: PDFKit.PDFDocument,
  amountPaise: number,
  x: number,
  y: number,
  width: number,
  options: { bold?: boolean; size?: number } = {}
) {
  const size = options.size ?? 9;
  doc.font('NotoDevanagari').fontSize(size).fillColor(TEXT).text('₹', x, y, { lineBreak: false });
  doc.font(options.bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(size)
    .fillColor(TEXT)
    .text(money(amountPaise), x + 10, y, { width: width - 10, align: 'right', lineBreak: false });
}

function drawRule(doc: PDFKit.PDFDocument, y: number) {
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(0.7).strokeColor(BORDER).stroke();
}

function drawPageHeading(doc: PDFKit.PDFDocument, order: InvoiceOrder, firstPage: boolean) {
  if (firstPage) {
    const logoPath = path.join(
      process.cwd(),
      'public',
      'images',
      'shop-photos',
      'WhatsApp_Image_2026-06-25_at_12.55.44_PM.jpeg'
    );
    if (existsSync(logoPath)) doc.image(logoPath, MARGIN, 34, { fit: [66, 54] });

    doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY)
      .text('Chaudhary General Store', 116, 35, { width: 240 });
    doc.font('NotoDevanagari').fontSize(10).fillColor(MUTED)
      .text('चौधरी जनरल स्टोर', 116, 56);
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXT)
      .text('Shambhupur Koari, Darbar-tola, Pani-tanki', 116, 75, { width: 225 });
    doc.text('Bhagwanpur Subdistrict, Bihar 844114', 116, 87, { width: 225 });
    doc.text('+91 8051806325', 116, 99);

    doc.font('Helvetica-Bold').fontSize(20).fillColor(NAVY)
      .text('INVOICE', 370, 34, { width: 185, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(TEXT)
      .text(`Invoice No.  ${order.orderNumber}`, 350, 65, { width: 205, align: 'right' });
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXT)
      .text(`Order Date  ${date(order.createdAt)}`, 350, 80, { width: 205, align: 'right' });
    doc.text(`Invoice Date  ${date(order.createdAt)}`, 350, 93, { width: 205, align: 'right' });
    doc.text(`Payment  ${paymentLabel(order.paymentMethod)}`, 350, 106, { width: 205, align: 'right' });
    doc.text(`Status  ${statusLabel(order.paymentStatus)}`, 350, 119, { width: 205, align: 'right' });
    doc.moveTo(MARGIN, 139).lineTo(PAGE_WIDTH - MARGIN, 139).lineWidth(1.2).strokeColor(BLUE).stroke();
  } else {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
      .text('Chaudhary General Store · Invoice', MARGIN, 28);
    doc.font('Helvetica').fontSize(8).fillColor(MUTED)
      .text(order.orderNumber, PAGE_WIDTH - MARGIN - 180, 30, { width: 180, align: 'right' });
    drawRule(doc, 47);
  }
}

function drawAddressBlock(
  doc: PDFKit.PDFDocument,
  heading: string,
  values: string[],
  x: number,
  y: number,
  width: number
) {
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text(heading.toUpperCase(), x, y);
  let cursor = y + 17;
  for (const [index, value] of values.filter(Boolean).entries()) {
    doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .fillColor(index === 0 ? TEXT : MUTED);
    const height = doc.heightOfString(value, { width, lineGap: 1 });
    doc.text(value, x, cursor, { width, lineGap: 1 });
    cursor += height + 3;
  }
}

function drawTableHeading(doc: PDFKit.PDFDocument, y: number) {
  const x = MARGIN;
  doc.rect(x, y, PAGE_WIDTH - MARGIN * 2, 24).fill('#EAF1F6');
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
  doc.text('S. No.', x + 8, y + 8, { width: 34 });
  doc.text('Product Details', x + 44, y + 8, { width: 232 });
  doc.text('Qty', x + 282, y + 8, { width: 32, align: 'right' });
  doc.text('Unit Price', x + 322, y + 8, { width: 83, align: 'right' });
  doc.text('Line Total', x + 412, y + 8, { width: 94, align: 'right' });
  return y + 24;
}

function addPage(doc: PDFKit.PDFDocument, order: InvoiceOrder) {
  doc.addPage({
    size: 'A4',
    margins: { top: MARGIN, bottom: PDF_BOTTOM_MARGIN, left: MARGIN, right: MARGIN },
  });
  drawPageHeading(doc, order, false);
  return drawTableHeading(doc, 61);
}

export function generateInvoicePdf(order: InvoiceOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: PDF_BOTTOM_MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      compress: true,
      info: {
        Title: `Invoice ${order.orderNumber}`,
        Author: 'Chaudhary General Store',
        Subject: `Order ${order.orderNumber}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      doc.registerFont('NotoDevanagari', devanagariFont);
      drawPageHeading(doc, order, true);

      const address = record(order.addressSnapshot);
      const billing = [
        order.customerName,
        order.customerPhone,
        order.customerEmail ?? '',
      ];
      const shipTo = [
        text(address.full_name) || order.customerName,
        text(address.phone) || order.customerPhone,
        text(address.address_line1),
        text(address.address_line2),
        text(address.landmark) ? `Near ${text(address.landmark)}` : '',
        [text(address.city), text(address.state)].filter(Boolean).join(', '),
        [text(address.pincode ?? address.postal_code), text(address.country)].filter(Boolean).join(' '),
      ];
      drawAddressBlock(doc, 'Bill To', billing, MARGIN, 155, 235);
      drawAddressBlock(doc, 'Ship To', shipTo, 315, 155, 240);

      const addressY = Math.max(234, 155 + Math.max(
        17 + billing.filter(Boolean).length * 15,
        17 + shipTo.filter(Boolean).length * 15
      ));
      let y = drawTableHeading(doc, addressY + 10);
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT);

      order.items.forEach((item, index) => {
        const details = [item.productName, item.brand, item.unit].filter(Boolean).join('\n');
        const detailsHeight = doc.heightOfString(details, { width: 230, lineGap: 2 });
        const rowHeight = Math.max(31, detailsHeight + 14);
        if (y + rowHeight > PAGE_BOTTOM) y = addPage(doc, order);

        if (index % 2 === 1) {
          doc.rect(MARGIN, y, PAGE_WIDTH - MARGIN * 2, rowHeight).fill(ROW_ALT);
        }
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT);
        doc.text(String(index + 1), MARGIN + 8, y + 10, { width: 34 });
        doc.text(details, MARGIN + 44, y + 7, { width: 230, lineGap: 2 });
        doc.text(String(item.quantity), MARGIN + 282, y + 10, { width: 32, align: 'right' });
        drawMoney(doc, item.unitPricePaise, MARGIN + 322, y + 10, 83);
        drawMoney(doc, item.lineTotalPaise, MARGIN + 412, y + 10, 94);
        y += rowHeight;
        drawRule(doc, y);
      });

      const breakdown = [
        { label: 'Subtotal', amount: order.subtotalPaise },
        ...(order.discountPaise > 0 ? [{ label: 'Discount', amount: -order.discountPaise }] : []),
        ...(order.deliveryChargePaise > 0 ? [{ label: 'Delivery', amount: order.deliveryChargePaise }] : []),
        ...(order.gstPaise > 0 ? [{ label: 'GST', amount: order.gstPaise }] : []),
      ];
      const reconciles = order.subtotalPaise - order.discountPaise +
        order.deliveryChargePaise + order.gstPaise === order.totalPaise;
      const payment = order.payments[0];
      const paymentReference = order.utrNumber || payment?.gatewayPaymentId || '';
      const paymentDate = payment?.capturedAt ?? payment?.verifiedAt;
      const summaryHeight = 81 + (reconciles ? breakdown.length * 18 : 0) +
        (paymentReference ? 13 : 0) + (paymentDate ? 13 : 0);
      if (y + summaryHeight > PAGE_BOTTOM) y = addPage(doc, order);
      y += 14;
      drawRule(doc, y);
      y += 13;

      if (reconciles) {
        for (const row of breakdown) {
          const value = Math.abs(row.amount);
          const label = row.amount < 0 ? `${row.label} (-)` : row.label;
          doc.font('Helvetica').fontSize(9).fillColor(TEXT)
            .text(label, 365, y, { width: 100 });
          drawMoney(doc, value, 465, y, 90);
          y += 18;
        }
      }

      doc.moveTo(365, y - 2).lineTo(PAGE_WIDTH - MARGIN, y - 2).lineWidth(0.8).strokeColor(BORDER).stroke();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY)
        .text('Grand Total', 365, y + 5, { width: 100 });
      drawMoney(doc, order.totalPaise, 465, y + 5, 90, { bold: true, size: 11 });
      y += 29;

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLUE).text('PAYMENT INFORMATION', MARGIN, y);
      y += 15;
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT)
        .text(`${paymentLabel(order.paymentMethod)} · ${statusLabel(order.paymentStatus)}`, MARGIN, y);
      if (paymentReference) {
        y += 13;
        doc.text(`Payment reference: ${paymentReference}`, MARGIN, y, { width: 490 });
      }
      if (paymentDate) {
        y += 13;
        doc.text(`Payment date: ${date(paymentDate)}`, MARGIN, y);
      }

      const pages = doc.bufferedPageRange();
      for (let pageIndex = 0; pageIndex < pages.count; pageIndex += 1) {
        doc.switchToPage(pages.start + pageIndex);
        doc.font('Helvetica').fontSize(8).fillColor(MUTED)
          .text(
            `Chaudhary General Store  ·  ${order.orderNumber}  ·  Page ${pageIndex + 1} of ${pages.count}`,
            MARGIN,
            PAGE_HEIGHT - 28,
            { width: PAGE_WIDTH - MARGIN * 2, align: 'center', lineBreak: false }
          );
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

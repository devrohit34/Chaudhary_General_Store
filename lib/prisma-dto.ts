import 'server-only';
import type { Address, Banner, Category, Coupon, Order, OrderItem, Product } from '@/lib/store-types';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

export function toCategoryDto(category: {
  id: string; name: string; nameHi: string | null; slug: string; icon: string | null;
  imageUrl: string | null; description: string | null; sortOrder: number; isActive: boolean;
}): Category {
  return {
    id: category.id, name: category.name, name_hi: category.nameHi, slug: category.slug,
    icon: category.icon, image_url: category.imageUrl, description: category.description,
    sort_order: category.sortOrder, is_active: category.isActive,
  };
}

export function toProductDto(product: {
  id: string; categoryId: string | null; name: string; nameHi: string | null; slug: string;
  description: string | null; descriptionHi: string | null; brand: string | null; sku: string | null;
  pricePaise: number; originalPricePaise: number | null; discountPercent: number; unit: string;
  weight: string | null; stockQuantity: number; minStockAlert: number; imageUrl: string | null;
  images: string[]; tags: string[]; isActive: boolean; isFeatured: boolean; isFlashSale: boolean;
  flashSalePricePaise: number | null; flashSaleEndsAt: Date | null; rating: number; reviewCount: number;
  gstBasisPoints: number; hsnCode: string | null; createdAt: Date; updatedAt: Date;
}): Product {
  return {
    id: product.id, category_id: product.categoryId, name: product.name, name_hi: product.nameHi,
    slug: product.slug, description: product.description, description_hi: product.descriptionHi,
    brand: product.brand, sku: product.sku, price: product.pricePaise / 100,
    original_price: product.originalPricePaise === null ? null : product.originalPricePaise / 100,
    discount_percent: product.discountPercent, unit: product.unit, weight: product.weight,
    stock_quantity: product.stockQuantity, min_stock_alert: product.minStockAlert,
    image_url: product.imageUrl, images: product.images, tags: product.tags,
    is_active: product.isActive, is_featured: product.isFeatured, is_flash_sale: product.isFlashSale,
    flash_sale_price: product.flashSalePricePaise === null ? null : product.flashSalePricePaise / 100,
    flash_sale_ends_at: product.flashSaleEndsAt?.toISOString() ?? null, rating: product.rating,
    review_count: product.reviewCount, gst_percent: product.gstBasisPoints / 100,
    hsn_code: product.hsnCode, created_at: product.createdAt.toISOString(), updated_at: product.updatedAt.toISOString(),
  };
}

export function toOrderItemDto(item: {
  id: string; productId: string | null; productName: string; productImage: string | null;
  brand: string | null; unit: string | null; unitPricePaise: number; quantity: number;
  gstBasisPoints: number;
}): OrderItem {
  return {
    id: item.id, product_id: item.productId, product_name: item.productName,
    product_image: item.productImage, brand: item.brand, unit: item.unit,
    price: item.unitPricePaise / 100, quantity: item.quantity, gst_percent: item.gstBasisPoints / 100,
  };
}

export function toOrderDto(order: {
  id: string; orderNumber: string; status: string; paymentMethod: string; paymentStatus: string;
  subtotalPaise: number; discountPaise: number; deliveryChargePaise: number; gstPaise: number;
  totalPaise: number; addressSnapshot: unknown; deliverySlot: string | null; deliveryOtp: string | null;
  isExpress: boolean; utrNumber: string | null; paymentScreenshotUrl: string | null;
  upiVerifiedAt: Date | null; upiRejectedReason: string | null; qrCreatedAt: Date | null;
  createdAt: Date; updatedAt: Date; deliveredAt: Date | null;
  items?: Parameters<typeof toOrderItemDto>[0][];
}): Order {
  const address = asRecord(order.addressSnapshot);
  return {
    id: order.id, order_number: order.orderNumber, status: order.status,
    payment_method: order.paymentMethod, payment_status: order.paymentStatus,
    subtotal: order.subtotalPaise / 100, discount_amount: order.discountPaise / 100,
    delivery_charge: order.deliveryChargePaise / 100, gst_amount: order.gstPaise / 100,
    total_amount: order.totalPaise / 100,
    address_snapshot: {
      full_name: String(address.full_name ?? ''),
      phone: String(address.phone ?? ''),
      address_line1: String(address.address_line1 ?? ''),
      address_line2: typeof address.address_line2 === 'string' ? address.address_line2 : null,
      city: String(address.city ?? ''),
      state: String(address.state ?? ''),
      pincode: String(address.pincode ?? address.postal_code ?? ''),
      landmark: typeof address.landmark === 'string' ? address.landmark : null,
    },
    delivery_slot: order.deliverySlot, delivery_otp: order.deliveryOtp, is_express: order.isExpress,
    utr_number: order.utrNumber, payment_screenshot_url: order.paymentScreenshotUrl,
    upi_verified_at: order.upiVerifiedAt?.toISOString() ?? null,
    upi_rejected_reason: order.upiRejectedReason, qr_created_at: order.qrCreatedAt?.toISOString() ?? null,
    created_at: order.createdAt.toISOString(), updated_at: order.updatedAt.toISOString(),
    delivered_at: order.deliveredAt?.toISOString() ?? null,
    order_items: order.items?.map(toOrderItemDto),
  };
}

export function toCouponDto(coupon: {
  id: string; code: string; description: string | null; discountType: string; discountValue: number;
  minOrderPaise: number; maxDiscountPaise: number | null; validUntil: Date | null; isActive: boolean;
}): Coupon {
  return {
    id: coupon.id, code: coupon.code, description: coupon.description,
    discount_type: coupon.discountType as Coupon['discount_type'],
    discount_value: coupon.discountType === 'fixed' ? coupon.discountValue / 100 : coupon.discountValue,
    min_order_amount: coupon.minOrderPaise / 100,
    max_discount: coupon.maxDiscountPaise === null ? null : coupon.maxDiscountPaise / 100,
    valid_until: coupon.validUntil?.toISOString() ?? null, is_active: coupon.isActive,
  };
}

export function toBannerDto(banner: {
  id: string; title: string; subtitle: string | null; imageUrl: string; linkUrl: string | null;
  sortOrder: number; isActive: boolean;
}): Banner {
  return {
    id: banner.id, title: banner.title, subtitle: banner.subtitle, image_url: banner.imageUrl,
    link_url: banner.linkUrl, sort_order: banner.sortOrder, is_active: banner.isActive,
  };
}

export function toAddressDto(address: {
  id: string; label: string; fullName: string; phone: string; addressLine1: string;
  addressLine2: string | null; city: string; state: string; postalCode: string;
  landmark: string | null; isDefault: boolean;
}): Address {
  return {
    id: address.id, label: address.label, full_name: address.fullName, phone: address.phone,
    address_line1: address.addressLine1, address_line2: address.addressLine2,
    city: address.city, state: address.state, postal_code: address.postalCode,
    landmark: address.landmark, is_default: address.isDefault,
  };
}

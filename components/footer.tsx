
import Image from 'next/image';
import Link from 'next/link';
import {
  Phone,
  Mail,
  MapPin,
  Instagram,
  MessageCircle,
  ShoppingBasket,
  Truck,
  CreditCard,
  ChevronRight,
  ArrowUpRight,
  Headphones,
} from 'lucide-react';

const shopLinks = [
  { label: 'All Categories', href: '/categories' },
  { label: 'All Products', href: '/products' },
  { label: 'Fresh Dairy', href: '/categories/dairy' },
  { label: 'Snacks & Namkeen', href: '/categories/snacks' },
];

const customerLinks = [
  { label: 'My Account', href: '/account' },
  { label: 'My Orders', href: '/orders' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact Us', href: '/contact' },
  { label: 'Cancellation & Refunds', href: '/cancellation-refunds' },
];

const paymentMethods = ['UPI', 'PhonePe', 'GPay', 'Paytm', 'COD'];

export function Footer() {
  return (
    <footer className="mt-16 overflow-hidden border-t border-emerald-900/10 bg-[#F4F8F4]">

      {/* Store Benefits */}
      <div className="border-b border-emerald-900/10 bg-white">
        <div className="container mx-auto grid grid-cols-2 gap-5 px-4 py-7 md:grid-cols-4">

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#159B4A]">
              <ShoppingBasket className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Daily Essentials</p>
              <p className="text-xs text-gray-500">Everything you need</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#159B4A]">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Home Delivery</p>
              <p className="text-xs text-gray-500">Shop from home</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#159B4A]">
              <Headphones className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Customer Support</p>
              <p className="text-xs text-gray-500">We&apos;re here to help</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#159B4A]">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">Easy Payments</p>
              <p className="text-xs text-gray-500">Multiple payment options</p>
            </div>
          </div>

        </div>
      </div>

      {/* Main Footer */}
      <div className="bg-[#123D2B] text-white">
        <div className="container mx-auto px-4 py-14">

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-12">

            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-4">

              <Link href="/" className="mb-5 inline-flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-lg">
                  <Image
                    src="/images/logo/cgs-logo.png"
                    alt="Chaudhary General Store Logo"
                    width={60}
                    height={60}
                    className="h-full w-full object-contain"
                  />
                </div>

                <div>
                  <h2 className="text-xl font-extrabold tracking-tight">
                    Chaudhary General Store
                  </h2>
                  <p className="mt-1 text-sm text-emerald-200">
                    चौधरी जेनरल स्टोर
                  </p>
                </div>
              </Link>

              <p className="max-w-sm text-sm leading-7 text-emerald-100/80">
                Your trusted neighbourhood kirana store. Bringing groceries
                and daily essentials closer to your everyday life.
              </p>

              <Link
                href="/about"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-colors hover:text-white"
              >
                Discover Our Store
                <ArrowUpRight className="h-4 w-4" />
              </Link>

              {/* Social Links */}
              <div className="mt-6 flex items-center gap-3">

                <Link
                  href="https://www.instagram.com/kundankumarchaudhary_kkc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Follow us on Instagram"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 transition-all duration-200 hover:-translate-y-1 hover:bg-[#159B4A] hover:border-emerald-300"
                >
                  <Instagram className="h-5 w-5" />
                </Link>

                <Link
                  href="https://wa.me/918051806325"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Contact us on WhatsApp"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/5 transition-all duration-200 hover:-translate-y-1 hover:bg-[#159B4A] hover:border-emerald-300"
                >
                  <MessageCircle className="h-5 w-5" />
                </Link>

              </div>

              <p className="mt-3 text-xs text-emerald-200/60">
                Connect with Chaudhary General Store.
              </p>

            </div>

            {/* Explore Store */}
            <div className="lg:col-span-2">

              <h3 className="mb-6 text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                Explore Store
              </h3>

              <ul className="space-y-4">
                {shopLinks.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group inline-flex items-center gap-2 text-sm text-emerald-50/75 transition-colors hover:text-white"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-emerald-400 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

            </div>

            {/* Customer Care */}
            <div className="lg:col-span-2">

              <h3 className="mb-6 text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                Customer Care
              </h3>

              <ul className="space-y-4">
                {customerLinks.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group inline-flex items-center gap-2 text-sm text-emerald-50/75 transition-colors hover:text-white"
                    >
                      <ChevronRight className="h-3.5 w-3.5 text-emerald-400 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>

            </div>

            {/* Contact Card */}
            <div className="sm:col-span-2 lg:col-span-4">

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-xl shadow-black/5">

                <div className="flex items-center gap-2 text-emerald-300">
                  <Headphones className="h-4 w-4" />
                  <p className="text-xs font-extrabold uppercase tracking-[0.16em]">
                    Get In Touch
                  </p>
                </div>

                <h3 className="mt-3 text-xl font-bold">
                  Need help with your order?
                </h3>

                <p className="mt-2 text-sm leading-6 text-emerald-100/70">
                  Contact our store for questions about products, shopping
                  and your orders.
                </p>

                <div className="mt-6 space-y-5">

                  <a
                    href="tel:+918051806325"
                    className="group flex items-center gap-3"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300 transition-colors group-hover:bg-[#159B4A] group-hover:text-white">
                      <Phone className="h-5 w-5" />
                    </span>

                    <span>
                      <span className="block text-xs text-emerald-200/60">
                        Call our store
                      </span>
                      <span className="mt-1 block text-sm font-semibold text-white">
                        80518 06325
                      </span>
                    </span>

                    <ArrowUpRight className="ml-auto h-4 w-4 text-emerald-300" />
                  </a>

                  <a
                    href="mailto:kkc8014@gmail.com"
                    className="group flex items-center gap-3"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300 transition-colors group-hover:bg-[#159B4A] group-hover:text-white">
                      <Mail className="h-5 w-5" />
                    </span>

                    <span className="min-w-0">
                      <span className="block text-xs text-emerald-200/60">
                        Email us
                      </span>
                      <span className="mt-1 block break-all text-sm font-semibold text-white">
                        kkc8014@gmail.com
                      </span>
                    </span>

                    <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-emerald-300" />
                  </a>

                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-300">
                      <MapPin className="h-5 w-5" />
                    </span>

                    <span>
                      <span className="block text-xs text-emerald-200/60">
                        Store Location
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-emerald-50/85">
                        Shambhupur Koari, Darbar-tola, Pani-tanki,
                        Bhagwanpur, Bihar 844114
                      </span>
                    </span>
                  </div>

                </div>

                {/* Contact Actions */}
                <div className="mt-6 grid grid-cols-2 gap-3">

                  <a
                    href="tel:+918051806325"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#159B4A] px-3 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-[#117D3C]"
                  >
                    <Phone className="h-4 w-4" />
                    Call Store
                  </a>

                  <Link
                    href="https://wa.me/918051806325"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-white/20"
                  >
                    <MessageCircle className="h-4 w-4" />
                    WhatsApp
                  </Link>

                </div>

              </div>
            </div>

          </div>

          {/* Payment Options */}
          <div className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-8 md:flex-row md:items-center md:justify-between">

            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-300">
                Payment Options
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {paymentMethods.map((method) => (
                  <span
                    key={method}
                    className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-emerald-50"
                  >
                    {method}
                  </span>
                ))}
              </div>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-300 transition-colors hover:text-white"
            >
              Continue Shopping
              <ArrowUpRight className="h-4 w-4" />
            </Link>

          </div>

          {/* Copyright */}
          <div className="mt-8 flex flex-col gap-3 border-t border-white/10 pt-6 text-center md:flex-row md:items-center md:justify-between md:text-left">

            <p className="text-xs leading-6 text-emerald-100/65">
              © {new Date().getFullYear()} Chaudhary General Store.
              <span className="mx-1 hidden sm:inline">·</span>
              <span className="block sm:inline">
                Owner: Kundan Kumar Chaudhary
              </span>
            </p>

            <p className="text-xs text-emerald-100/60">
              Made for everyday shopping.
            </p>

          </div>

        </div>
      </div>
    </footer>
  );
}

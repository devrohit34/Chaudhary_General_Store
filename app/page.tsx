
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Category, Product } from '@/lib/store-types';
import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import {
  Truck,
  Clock,
  ShieldCheck,
  ChevronRight,
  Package,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const storeBenefits = [
  {
    icon: Truck,
    title: 'Home Delivery',
    description: 'Within 10 km radius',
  },
  {
    icon: Clock,
    title: 'Convenient Hours',
    description: 'Open daily for you',
  },
  {
    icon: ShieldCheck,
    title: 'Quality Products',
    description: 'Fresh & authentic',
  },
];

const whatsappDeliveryLink =
  'https://wa.me/918051806325?text=Hi%2C%20I%20want%20to%20check%20home%20delivery%20availability.%20My%20location%20is%3A%20';

export default function HomePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchData() {
      try {
        const [categoryResponse, productResponse] = await Promise.all([
          fetch('/api/catalog/categories', {
            cache: 'no-store',
            signal: controller.signal,
          }),
          fetch('/api/catalog/products?limit=20', {
            cache: 'no-store',
            signal: controller.signal,
          }),
        ]);

        if (!categoryResponse.ok || !productResponse.ok) {
          throw new Error('Store catalog is temporarily unavailable.');
        }

        const [categoryPayload, productPayload]: unknown[] =
          await Promise.all([
            categoryResponse.json(),
            productResponse.json(),
          ]);

        if (
          typeof categoryPayload !== 'object' ||
          categoryPayload === null ||
          !('categories' in categoryPayload) ||
          !Array.isArray(categoryPayload.categories) ||
          typeof productPayload !== 'object' ||
          productPayload === null ||
          !('products' in productPayload) ||
          !Array.isArray(productPayload.products)
        ) {
          throw new Error('Store catalog returned invalid data.');
        }

        setCategories(
          (categoryPayload.categories as Category[]).slice(0, 15)
        );

        setProducts(productPayload.products as Product[]);
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error(
          'Home catalog load failed:',
          error instanceof Error ? error.message : 'Unknown error'
        );

        toast.error(
          error instanceof Error
            ? error.message
            : 'Store catalog is temporarily unavailable.'
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => controller.abort();
  }, []);

  return (
    <div className="animate-fade-in">

      {/* Hero Section */}
      <section className="relative h-[300px] overflow-hidden sm:h-[420px]">
        <Image
          src="/images/shop-photos/My_Dukaan_Pics.jpeg"
          alt="Chaudhary General Store"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-primary/90 via-primary/70 to-primary/30" />

        <div className="absolute inset-0 flex items-center">
          <div className="container mx-auto px-4 sm:px-8">
            <div className="max-w-lg space-y-4 text-primary-foreground">

              <h1 className="text-3xl font-bold leading-tight sm:text-5xl">
                Chaudhary General Store
              </h1>

              <p className="text-lg opacity-90 sm:text-xl">
                चौधरी जेनरल स्टोर
              </p>

              <p className="text-base opacity-80">
                Your trusted neighborhood kirana store for fresh
                groceries and daily essentials.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Link href="/products">
                  <Button
                    size="lg"
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    Browse Products
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>

                <Link href="/categories">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-background/30 bg-background/20 text-primary-foreground hover:bg-background/30"
                  >
                    Categories
                  </Button>
                </Link>
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* Store Benefits Strip */}
      <section className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">

            {storeBenefits.map((item) => (
              <div key={item.title} className="flex items-center gap-3">

                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-sm font-semibold">
                    {item.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.description}
                  </div>
                </div>

              </div>
            ))}

          </div>
        </div>
      </section>

      {/* Shop by Category */}
      <section className="container mx-auto px-4 py-8">

        <div className="mb-6 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold sm:text-2xl">
            Shop by Category
          </h2>

          <Link
            href="/categories"
            className="flex shrink-0 items-center text-sm text-primary hover:underline"
          >
            View All
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-8">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square rounded-xl shimmer"
              />
            ))}
          </div>
        ) : categories.length > 0 ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-8">

            {categories.map((cat) => (
              <Link
                key={cat.id}
                href={`/categories/${cat.slug}`}
                aria-label={`Browse ${cat.name} category`}
              >
                <div className="group text-center">

                  <div className="relative mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br from-primary/10 to-accent/10 text-4xl transition-all group-hover:scale-105 group-hover:border-primary/30">

                    {cat.image_url ? (
                      <Image
                        src={cat.image_url}
                        alt={cat.name}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 33vw, 12vw"
                        className="object-cover"
                      />
                    ) : (
                      cat.icon || '🛒'
                    )}

                  </div>

                  <div className="line-clamp-2 text-xs font-medium">
                    {cat.name}
                  </div>

                </div>
              </Link>
            ))}

          </div>
        ) : (
          <div className="rounded-xl border p-8 text-center">
            <p className="text-sm text-muted-foreground">
              Categories are currently unavailable.
            </p>
            <Link
              href="/categories"
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Explore Categories
            </Link>
          </div>
        )}

      </section>

      {/* Products Section */}
      <section className="container mx-auto px-4 py-8">

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Package className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-xl font-bold sm:text-2xl">
                Our Products
              </h2>
              <p className="text-sm text-muted-foreground">
                Quality groceries and essentials
              </p>
            </div>
          </div>

          <Link href="/products">
            <Button variant="outline">
              View All
            </Button>
          </Link>

        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[3/4] rounded-xl shimmer"
              />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border p-8 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />

            <h3 className="font-semibold">
              No products available right now
            </h3>

            <p className="mt-1 text-sm text-muted-foreground">
              Please check back shortly.
            </p>

            <Link href="/products" className="mt-3 inline-block">
              <Button variant="outline">
                Explore Products
              </Button>
            </Link>
          </div>
        )}

      </section>

      {/* About Our Store */}
      <section className="container mx-auto px-4 py-10 sm:py-12">

        <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">

          <div className="grid md:grid-cols-2">

            {/* Store Image */}
            <div className="relative min-h-[280px] sm:min-h-[340px]">
              <Image
                src="/images/shop-photos/Dukaaan_pics.jpeg"
                alt="Inside Chaudhary General Store"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>

            {/* Store Information */}
            <div className="flex flex-col justify-center bg-gradient-to-br from-card to-muted/30 p-6 sm:p-8 lg:p-10">

              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary">
                About Chaudhary General Store
              </p>

              <h2 className="text-2xl font-extrabold leading-tight sm:text-3xl">
                Your neighbourhood store, just a click away.
              </h2>

              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                Chaudhary General Store is your trusted neighbourhood
                kirana store, serving the community with groceries,
                daily essentials, and quality products. Owned by
                Kundan Kumar Chaudhary, we are committed to providing
                reliable service and a convenient shopping experience.
              </p>

              {/* Store Benefits */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">

                <div className="flex items-center gap-3 rounded-xl border bg-background/70 p-3">
                  <Truck className="h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="text-sm font-semibold">
                      Home Delivery
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Within 10 km radius
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border bg-background/70 p-3">
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />

                  <div>
                    <p className="text-sm font-semibold">
                      Quality Products
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Everyday essentials
                    </p>
                  </div>
                </div>

              </div>

              {/* Customer Actions */}
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">

                <Link href="/products" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full">
                    Shop Now
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>

                <Link href="/about" className="w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                  >
                    Explore Our Store
                  </Button>
                </Link>

                <a
                  href={whatsappDeliveryLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Check home delivery availability on WhatsApp"
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
                >
                  <MessageCircle className="h-4 w-4" />
                  Check Delivery
                </a>

              </div>

              <p className="mt-4 text-xs text-muted-foreground">
                Have a question? Contact us directly on WhatsApp.
              </p>

            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

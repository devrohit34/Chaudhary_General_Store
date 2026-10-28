'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Product, Review } from '@/lib/store-types';
import { useCart } from '@/lib/cart-context';
import { ProductCard } from '@/components/product-card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, Heart, ShoppingCart, Truck, ShieldCheck, ChevronRight, Minus, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const router = useRouter();
  const { addItem, toggleWishlist, isWishlisted, addRecentlyViewed } = useCart();

  useEffect(() => {
    async function fetchData() {
      try {
        const productResponse = await fetch(`/api/catalog/products?slug=${encodeURIComponent(slug)}&limit=1`, { cache: 'no-store' });
        if (!productResponse.ok) throw new Error('Product is temporarily unavailable.');
        const productPayload: unknown = await productResponse.json();
        if (typeof productPayload !== 'object' || productPayload === null ||
            !('products' in productPayload) || !Array.isArray(productPayload.products)) {
          throw new Error('Product catalog returned invalid data.');
        }
        const prod = (productPayload.products as Product[])[0] || null;
        if (!prod) return;
        setProduct(prod);
        addRecentlyViewed(prod);
        const requests: Promise<Response>[] = [
          fetch(`/api/catalog/reviews?productId=${encodeURIComponent(prod.id)}`, { cache: 'no-store' }),
        ];
        if (prod.category_id) {
          requests.push(fetch(
            `/api/catalog/products?categoryId=${encodeURIComponent(prod.category_id)}&excludeId=${encodeURIComponent(prod.id)}&limit=5`,
            { cache: 'no-store' }
          ));
        }
        const responses = await Promise.all(requests);
        if (responses.some((response) => !response.ok)) throw new Error('Product details are temporarily incomplete.');
        const reviewPayload: unknown = await responses[0].json();
        if (typeof reviewPayload !== 'object' || reviewPayload === null ||
            !('reviews' in reviewPayload) || !Array.isArray(reviewPayload.reviews)) {
          throw new Error('Review service returned invalid data.');
        }
        setReviews(reviewPayload.reviews as Review[]);
        if (prod.category_id) {
          const relatedPayload: unknown = await responses[1].json();
          if (typeof relatedPayload !== 'object' || relatedPayload === null ||
              !('products' in relatedPayload) || !Array.isArray(relatedPayload.products)) {
            throw new Error('Related product catalog returned invalid data.');
          }
          setRelated(relatedPayload.products as Product[]);
        }
      } catch (error) {
        console.error('Product detail load failed:', error instanceof Error ? error.message : 'Unknown error');
        toast.error(error instanceof Error ? error.message : 'Product details are temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [addRecentlyViewed, slug]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="aspect-square rounded-xl shimmer" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 rounded shimmer" />
            <div className="h-6 w-1/2 rounded shimmer" />
            <div className="h-24 rounded shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">Product not found.</p>
        <Link href="/"><Button className="mt-4">Back to Home</Button></Link>
      </div>
    );
  }

  const wishlisted = isWishlisted(product.id);

  const handleAddToCart = () => {
    addItem(product, quantity);
    toast.success(`${quantity} x ${product.name} added to cart`);
  };

  const handleBuyNow = () => {
    addItem(product, quantity);
    router.push('/checkout');
  };

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/" className="hover:text-primary">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href="/categories" className="hover:text-primary">Categories</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground line-clamp-1">{product.name}</span>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Image */}
        <div className="relative">
          <div className="relative mx-auto flex aspect-square w-full max-w-[300px] max-h-[300px] items-center justify-center overflow-hidden rounded-2xl border bg-muted">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                width={300}
                height={300}
                sizes="(max-width: 768px) 100vw, 300px"
                className="h-full w-full object-contain"
                priority
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-9xl">🛒</div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-4">
          {product.brand && (
            <div className="text-sm text-primary font-medium uppercase tracking-wide">{product.brand}</div>
          )}
          <h1 className="text-3xl font-bold">{product.name}</h1>
          {product.name_hi && <p className="text-lg text-muted-foreground">{product.name_hi}</p>}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded text-sm font-medium text-primary">
              <Star className="h-4 w-4 fill-primary" />
              {product.rating || 'New'}
            </div>
            <span className="text-sm text-muted-foreground">{product.review_count} reviews</span>
            {product.stock_quantity > 0 ? (
              <Badge className="bg-primary/10 text-primary">In Stock</Badge>
            ) : (
              <Badge variant="destructive">Out of Stock</Badge>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold">₹{product.price}</span>
          </div>
          {product.weight && <p className="text-sm text-muted-foreground">Weight: {product.weight}</p>}

          {/* Quantity */}
          <div className="flex items-center gap-4">
            <div className="flex items-center border rounded-lg">
              <Button variant="ghost" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <Button variant="ghost" size="icon" onClick={() => setQuantity(quantity + 1)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                toggleWishlist(product.id);
                toast.success(wishlisted ? 'Removed from wishlist' : 'Added to wishlist');
              }}
            >
              <Heart className={`h-4 w-4 mr-2 ${wishlisted ? 'fill-destructive text-destructive' : ''}`} />
              {wishlisted ? 'Wishlisted' : 'Wishlist'}
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button onClick={handleAddToCart} size="lg" className="flex-1">
              <ShoppingCart className="h-5 w-5 mr-2" /> Add to Cart
            </Button>
            <Button onClick={handleBuyNow} size="lg" variant="secondary" className="flex-1">
              Buy Now
            </Button>
          </div>

          {/* Trust */}
          <div className="grid grid-cols-3 gap-3 pt-4 border-t">
            <div className="flex flex-col items-center text-center gap-1">
              <Truck className="h-5 w-5 text-primary" />
              <span className="text-xs">Free Delivery</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span className="text-xs">Quality Assured</span>
            </div>
            <div className="flex flex-col items-center text-center gap-1">
              <Check className="h-5 w-5 text-primary" />
              <span className="text-xs">Easy Returns</span>
            </div>
          </div>

          {/* GST Info */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <p>HSN Code: {product.hsn_code || 'N/A'} · GST: {product.gst_percent}%</p>
            <p>SKU: {product.sku || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12">
        <Tabs defaultValue="description">
          <TabsList>
            <TabsTrigger value="description">Description</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({reviews.length})</TabsTrigger>
            <TabsTrigger value="specs">Specifications</TabsTrigger>
          </TabsList>
          <TabsContent value="description" className="mt-4">
            <div className="prose max-w-none">
              <p className="text-muted-foreground">{product.description || 'No description available.'}</p>
              {product.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {product.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="reviews" className="mt-4">
            {reviews.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No reviews yet. Be the first to review!</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((rev) => (
                  <div key={rev.id} className="border rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${i < rev.rating ? 'fill-primary text-primary' : 'text-muted'}`}
                          />
                        ))}
                      </div>
                      {rev.is_verified && <Badge className="bg-primary/10 text-primary">Verified</Badge>}
                    </div>
                    {rev.title && <h4 className="font-semibold">{rev.title}</h4>}
                    {rev.body && <p className="text-sm text-muted-foreground">{rev.body}</p>}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="specs" className="mt-4">
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">Brand</span><p className="font-medium">{product.brand || 'N/A'}</p></div>
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">Weight</span><p className="font-medium">{product.weight || 'N/A'}</p></div>
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">Unit</span><p className="font-medium">{product.unit}</p></div>
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">SKU</span><p className="font-medium">{product.sku || 'N/A'}</p></div>
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">HSN Code</span><p className="font-medium">{product.hsn_code || 'N/A'}</p></div>
              <div className="border rounded-lg p-3"><span className="text-sm text-muted-foreground">GST</span><p className="font-medium">{product.gst_percent}%</p></div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Related Products</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

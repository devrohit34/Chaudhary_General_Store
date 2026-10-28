'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Product } from '@/lib/store-types';
import { ProductCard } from '@/components/product-card';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { toast } from 'sonner';

function SearchContent() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [localQuery, setLocalQuery] = useState(query);

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  useEffect(() => {
    async function search() {
      if (!query) {
        setProducts([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(`/api/catalog/products?search=${encodeURIComponent(query)}&limit=50`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Search is temporarily unavailable.');
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || !('products' in payload) || !Array.isArray(payload.products)) {
          throw new Error('Product catalog returned invalid data.');
        }
        setProducts(payload.products as Product[]);
      } catch (error) {
        console.error('Product search failed:', error instanceof Error ? error.message : 'Unknown error');
        setProducts([]);
        toast.error(error instanceof Error ? error.message : 'Search is temporarily unavailable.');
      } finally {
        setLoading(false);
      }
    }
    search();
  }, [query]);

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-2xl font-bold mb-2">Search Results</h1>
      <p className="text-muted-foreground mb-6">
        {loading ? 'Searching...' : `${products.length} results for "${query}"`}
      </p>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] rounded-xl shimmer" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No products found. Try a different search term.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="container mx-auto px-4 py-8">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}

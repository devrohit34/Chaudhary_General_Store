'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useCart } from '@/lib/cart-context';
import type { CustomerSession } from '@/lib/store-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { User, Mail, Phone, Heart, Package, MapPin, LogOut, Star } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

function readApiError(value: unknown) {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string'
    ? value.error
    : null;
}

function readSessionUser(value: unknown): CustomerSession {
  if (typeof value !== 'object' || value === null || !('user' in value) ||
      typeof value.user !== 'object' || value.user === null ||
      !('id' in value.user) || typeof value.user.id !== 'string' ||
      !('email' in value.user) || typeof value.user.email !== 'string' ||
      !('full_name' in value.user) || typeof value.user.full_name !== 'string') {
    throw new Error('Account service returned invalid user data.');
  }
  return { id: value.user.id, email: value.user.email, full_name: value.user.full_name };
}

export default function AccountPage() {
  const { wishlist, recentlyViewed } = useCart();
  const [user, setUser] = useState<CustomerSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Account session is unavailable.');
        return response.json();
      })
      .then((payload: unknown) => {
        if (active && typeof payload === 'object' && payload !== null && 'user' in payload) {
          setUser(payload.user as CustomerSession | null);
        }
      })
      .catch((error: unknown) => {
        console.error('Account session lookup failed:', error instanceof Error ? error.message : 'Unknown error');
        if (active) toast.error('Could not load your account. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const signUp = async () => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, phone }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(payload) || 'Account creation failed.');
      setUser(readSessionUser(payload));
      toast.success('Account created successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Account creation failed.');
    }
  };

  const signIn = async () => {
    try {
      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(payload) || 'Sign-in failed.');
      setUser(readSessionUser(payload));
      toast.success('Welcome back!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-in failed.');
    }
  };

  const signOut = async () => {
    try {
      const response = await fetch('/api/auth/session', { method: 'DELETE' });
      if (!response.ok) throw new Error('Sign-out failed.');
      setUser(null);
      toast.success('Signed out');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Sign-out failed.');
    }
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-16"><div className="h-64 rounded-xl shimmer" /></div>;
  }

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <Image
            src="/images/shop-photos/WhatsApp_Image_2026-06-25_at_12.55.44_PM.jpeg"
            alt="Chaudhary General Store Logo"
            width={80}
            height={80}
            className="h-20 w-auto object-contain mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold">Welcome to Chaudhary General Store</h1>
          <p className="text-muted-foreground">चौधरी जेनरल स्टोर · Sign in or create an account</p>
        </div>

        <Tabs defaultValue="signin">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          <TabsContent value="signin">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
                <Button onClick={signIn} className="w-full">Sign In</Button>
                <p className="text-xs text-center text-muted-foreground">
                  Admin: kkc8014@gmail.com
                </p>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="signup">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div><Label>Full Name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" /></div>
                <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
                <div><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
                <Button onClick={signUp} className="w-full">Create Account</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-xs text-center text-muted-foreground mt-4">
          By signing in, you agree to our Terms & Privacy Policy
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-3xl font-bold mb-6">My Account</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-semibold">{user.email}</div>
                  <div className="text-sm text-muted-foreground">Member since 2026</div>
                </div>
              </div>
              <Button variant="outline" onClick={signOut} className="w-full"><LogOut className="h-4 w-4 mr-2" /> Sign Out</Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-2">
              <h3 className="font-semibold mb-3">Quick Links</h3>
              <Link href="/orders" className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                <Package className="h-5 w-5 text-primary" /> My Orders
              </Link>
              <Link href="/wishlist" className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                <Heart className="h-5 w-5 text-primary" /> Wishlist ({wishlist.length})
              </Link>
              <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                <MapPin className="h-5 w-5 text-primary" /> Saved Addresses
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Card><CardContent className="pt-6 text-center"><Package className="h-8 w-8 mx-auto text-primary mb-2" /><div className="text-2xl font-bold">0</div><div className="text-sm text-muted-foreground">Total Orders</div></CardContent></Card>
            <Card><CardContent className="pt-6 text-center"><Heart className="h-8 w-8 mx-auto text-primary mb-2" /><div className="text-2xl font-bold">{wishlist.length}</div><div className="text-sm text-muted-foreground">Wishlist Items</div></CardContent></Card>
          </div>

          {recentlyViewed.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Recently Viewed</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                  {recentlyViewed.slice(0, 6).map((p) => (
                    <Link key={p.id} href={`/product/${p.slug}`} className="flex-shrink-0 w-24">
                      <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-1 relative">
                        {p.image_url && <Image src={p.image_url} alt={p.name} fill className="object-cover" />}
                      </div>
                      <div className="text-xs line-clamp-2">{p.name}</div>
                      <div className="text-xs font-bold text-primary">₹{p.price}</div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'Unable to send the reset link right now.';
        throw new Error(message);
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send the reset link right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Forgot Your Password?</h1>
            <p className="text-sm text-muted-foreground">
              Enter your registered email address and we will send you a password reset link.
            </p>
          </div>

          {submitted ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              If an account exists with this email address, a password reset link has been sent.
            </div>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <Button type="submit" className="w-full bg-[#159B4A] hover:bg-[#117a3d]" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/account" className="font-medium text-[#159B4A] hover:underline">Back to Sign In</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

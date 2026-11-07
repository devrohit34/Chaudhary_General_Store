'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff } from 'lucide-react';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword, confirmPassword }),
      });

      const payload: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : 'The password could not be reset.';
        throw new Error(message);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The password could not be reset.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="container mx-auto max-w-md px-4 py-12">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <h1 className="text-2xl font-bold">Invalid or expired link</h1>
            <p className="text-sm text-muted-foreground">
              This password reset link is missing or invalid. Please request a new reset link.
            </p>
            <Link href="/account/forgot-password" className="inline-block text-[#159B4A] hover:underline">
              Request a new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-md px-4 py-12">
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold">Reset Your Password</h1>
            <p className="text-sm text-muted-foreground">Create a strong new password for your account.</p>
          </div>

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

          {success ? (
            <div className="space-y-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              <div>Your password has been updated successfully.</div>
              <Link href="/account" className="inline-block font-medium text-[#159B4A] hover:underline">Back to Sign In</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Enter a new password"
                    className="pr-10"
                    minLength={10}
                    maxLength={72}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Minimum 10 characters, maximum 72 characters.</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter the new password"
                  minLength={10}
                  maxLength={72}
                  required
                />
              </div>

              <Button type="submit" className="w-full bg-[#159B4A] hover:bg-[#117a3d]" disabled={loading}>
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/account" className="font-medium text-[#159B4A] hover:underline">Back to Sign In</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { createClient } from '@supabase/supabase-js';

export function getPaymentConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!keyId || !keySecret) throw new Error('Razorpay server credentials are not configured.');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase server credentials are not configured.');

  return {
    keyId,
    keySecret,
    supabase: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

export function razorpayAuth(keyId: string, keySecret: string) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

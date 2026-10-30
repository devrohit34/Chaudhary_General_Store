'use client';

import { useState } from 'react';
import type { Order } from '@/lib/store-types';
import { isOrderCancellationEligible, CANCELLATION_REASONS } from '@/lib/order-cancellation-policy';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type Props = {
  order: Order;
  onCancelled: (order: Order) => void;
};

export function OrderCancelButton({ order, onCancelled }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof CANCELLATION_REASONS)[number]>('Ordered by mistake');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOrderCancellationEligible(order.status)) return null;

  async function submitCancellation() {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.order_number)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, ...(reason === 'Other' ? { details } : {}) }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = typeof payload === 'object' && payload !== null && 'error' in payload &&
          typeof payload.error === 'string' ? payload.error : 'The order could not be cancelled.';
        throw new Error(message);
      }
      if (
        typeof payload !== 'object' || payload === null || !('order' in payload) ||
        typeof payload.order !== 'object' || payload.order === null ||
        !('status' in payload.order) || payload.order.status !== 'cancelled'
      ) {
        throw new Error('Order cancellation could not be confirmed. Refresh the order before trying again.');
      }
      onCancelled(payload.order as Order);
      toast.success('Order cancelled. Refund status is shown separately.');
      setOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'The order could not be cancelled.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button variant="destructive" onClick={() => { setError(''); setOpen(true); }}>
        Cancel Order
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => !submitting && setOpen(nextOpen)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel order #{order.order_number}?</DialogTitle>
            <DialogDescription>
              This cancels the order for ₹{order.total_amount.toFixed(2)}. The order will not be sent for fulfilment.
              Any refund for an online payment is a separate process and will show its own status here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label htmlFor={`cancel-reason-${order.id}`} className="text-sm font-medium">Reason for cancellation</label>
            <select
              id={`cancel-reason-${order.id}`}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof CANCELLATION_REASONS)[number])}
              disabled={submitting}
            >
              {CANCELLATION_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            {reason === 'Other' && (
              <Textarea
                value={details}
                onChange={(event) => setDetails(event.target.value.slice(0, 250))}
                placeholder="Tell us briefly why you are cancelling"
                maxLength={250}
                aria-label="Other cancellation reason"
                disabled={submitting}
              />
            )}
            {order.payment_method === 'cod' && order.payment_status !== 'paid' && (
              <p className="text-sm text-muted-foreground">No online payment refund is due for this COD order.</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Keep Order</Button>
            <Button variant="destructive" onClick={submitCancellation} disabled={submitting || (reason === 'Other' && details.trim().length < 3)}>
              {submitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

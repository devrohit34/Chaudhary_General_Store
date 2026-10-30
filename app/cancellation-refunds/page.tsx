import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

export default function CancellationRefundsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-primary">Home</Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">Cancellation and Refunds</span>
      </div>

      <article className="rounded-xl border bg-card p-6 sm:p-8">
        <h1 className="mb-2 text-3xl font-bold">Cancellation and Refunds</h1>
        <p className="mb-8 text-sm text-muted-foreground">Current online order handling at Chaudhary General Store</p>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold">Cancelling an order</h2>
          <p className="text-muted-foreground">
            You can request cancellation while an order is pending, confirmed, or being processed. Self-service
            cancellation is not available after an order is out for delivery, delivered, returned, or already cancelled.
            Contact the store if you need help with an order that is no longer eligible online.
          </p>
        </section>

        <section className="mb-6 space-y-2">
          <h2 className="text-xl font-semibold">Refunds</h2>
          <p className="text-muted-foreground">
            Cancellation and refund processing are separate. A refund is considered only when the payment record
            confirms a captured online Razorpay payment. The refund status shown in your order is updated from Razorpay
            confirmation; an uncertain payment or provider response may require reconciliation.
          </p>
          <p className="text-muted-foreground">
            Refund timing can depend on the payment provider and bank. We do not promise a fixed completion time here.
            Cash on Delivery orders that were not paid online do not receive an online payment refund.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Questions or exceptions</h2>
          <p className="text-muted-foreground">
            For help with a cancellation or refund, contact the store at{' '}
            <a className="text-primary underline" href="tel:+918051806325">80518 06325</a> or{' '}
            <a className="text-primary underline" href="mailto:kkc8014@gmail.com">kkc8014@gmail.com</a>.
            Business-specific exceptions can be reviewed with the store.
          </p>
        </section>
      </article>
    </div>
  );
}

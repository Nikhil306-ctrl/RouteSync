import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card.jsx';
import { EmptyState, InlineNotice } from '../../../components/ui/States.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import FoodImage from '../../../components/FoodImage.jsx';
import { useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useCart } from '../../../hooks/useCart.jsx';
import { formatCurrency } from '../../../lib/format.js';
import { menuItemImage } from '../../../lib/images.js';

export default function CartPage() {
  useDocumentTitle('Your cart');
  const cart = useCart();
  const [confirmClear, setConfirmClear] = useState(false);

  const restaurantLink = cart.restaurantSlug
    ? `/customer/restaurants/${cart.restaurantSlug}`
    : '/customer';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Your order"
        title="Cart"
        description="Review the dishes and quantities you have chosen. The cart is stored on this device until the trusted checkout flow replaces it with a confirmed order."
        actions={
          cart.count ? (
            <Button variant="secondary" icon={Trash2} onClick={() => setConfirmClear(true)}>
              Clear cart
            </Button>
          ) : null
        }
      />

      {cart.count === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Browse the active restaurant catalogue and add dishes from one kitchen to begin."
          action={<LinkButton to="/customer" icon={Store}>Discover kitchens</LinkButton>}
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="space-y-5">
            <Card>
              <CardHeader
                title={cart.restaurantName || 'Your items'}
                description={`${cart.count} item${cart.count === 1 ? '' : 's'} · one kitchen per cart`}
                action={
                  <Link
                    to={restaurantLink}
                    className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong"
                  >
                    Add more <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                }
              />

              <ul className="divide-y divide-line">
                {cart.items.map((item) => {
                  const image = menuItemImage({ name: item.name, image_url: item.imageUrl });
                  return (
                    <li key={item.menuItemId} className="flex gap-3.5 p-4 sm:gap-4 sm:p-5">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-slate-100 sm:h-24 sm:w-24">
                        <FoodImage src={image.src} alt={image.alt} />
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <h2 className="text-sm font-bold text-ink">{item.name}</h2>
                            <p className="mt-0.5 text-xs text-muted">
                              {formatCurrency(item.priceMinor)} each
                            </p>
                          </div>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-ink">
                            {formatCurrency(item.priceMinor * item.quantity)}
                          </p>
                        </div>

                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                          <div className="inline-flex items-center rounded-lg border border-line bg-white">
                            <button
                              type="button"
                              onClick={() => cart.decrement(item.menuItemId)}
                              disabled={item.quantity <= 1}
                              className="grid h-9 w-9 place-items-center rounded-l-lg text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              aria-label={`Decrease quantity of ${item.name}`}
                            >
                              <Minus className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <span className="min-w-9 text-center text-sm font-bold tabular-nums text-ink" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => cart.increment(item.menuItemId)}
                              disabled={item.quantity >= 50}
                              className="grid h-9 w-9 place-items-center rounded-r-lg text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                              aria-label={`Increase quantity of ${item.name}`}
                            >
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => cart.remove(item.menuItemId)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-slate-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="flex flex-col gap-2 border-t border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <Link
                  to={restaurantLink}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Continue browsing
                </Link>
                <p className="text-xs text-muted">
                  Item subtotal <span className="font-bold tabular-nums text-ink">{formatCurrency(cart.subtotalMinor)}</span>
                </p>
              </div>
            </Card>

            <InlineNotice tone="neutral" title="Cart stored on this device">
              <span className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                Quantities and prices were captured when the dishes were added. A trusted checkout must
                revalidate menu availability and prices before creating an order.
              </span>
            </InlineNotice>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24">
            <Card>
              <CardHeader title="Order summary" description="Item subtotal only. Delivery pricing is not invented here." />
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Items ({cart.count})</span>
                  <span className="font-semibold tabular-nums text-ink">{formatCurrency(cart.subtotalMinor)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Delivery fee</span>
                  <span className="text-xs font-semibold text-slate-500">Calculated by backend</span>
                </div>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">Delivery window</span>
                  <span className="text-xs font-semibold text-slate-500">Scheduling required</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Item subtotal</span>
                  <span className="font-display text-lg font-bold tabular-nums text-ink">
                    {formatCurrency(cart.subtotalMinor)}
                  </span>
                </div>

                <LinkButton to="/customer/checkout" icon={ArrowRight} className="w-full">
                  Continue to checkout
                </LinkButton>
                <p className="text-[0.68rem] leading-4 text-muted">
                  Checkout is a Phase 4 review screen. Order submission requires the Phase 5 trusted
                  backend and is not simulated.
                </p>
              </CardBody>
            </Card>

            <InlineNotice tone="warning" title="One kitchen per cart">
              <span className="flex items-start gap-2">
                <UtensilsCrossed className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Keeping one restaurant per cart keeps pickup unambiguous. Adding a dish from another
                kitchen asks before replacing this cart.
              </span>
            </InlineNotice>
          </aside>
        </div>
      )}

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear this cart?"
        description="Every item will be removed from this device's cart."
        size="sm"
      >
        <div className="space-y-4">
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
            This does not affect any order. It only clears the unsubmitted cart stored in this browser.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>Keep cart</Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={() => {
                cart.clear();
                setConfirmClear(false);
              }}
            >
              Clear cart
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

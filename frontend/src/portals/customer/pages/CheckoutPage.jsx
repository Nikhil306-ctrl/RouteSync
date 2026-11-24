import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
  Wallet,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import { LabeledTextarea } from '../../../components/ui/Field.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { useCart } from '../../../hooks/useCart.jsx';
import { formatCurrency, formatWindow } from '../../../lib/format.js';
import { listAddresses } from '../../../services/addresses.js';
import {
  createCustomerOrder,
  newIdempotencyKey,
  quoteOrder,
} from '../../../services/lifecycle.js';

function formatAddress(address) {
  return [
    address.address_line1,
    address.address_line2,
    address.landmark,
    `${address.city}, ${address.state}${address.pincode ? ` ${address.pincode}` : ''}`,
  ]
    .filter(Boolean)
    .join(', ');
}

export default function CheckoutPage() {
  useDocumentTitle('Checkout review');
  const { user } = useAuth();
  const cart = useCart();
  const navigate = useNavigate();
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [instructions, setInstructions] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const idempotencyKeyRef = useRef(newIdempotencyKey());

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!user) return [];
    return listAddresses(user.id);
  }, [user?.id]);

  const addresses = data ?? [];
  const defaultAddress = addresses.find((address) => address.is_default);
  const effectiveAddressId = selectedAddressId ?? defaultAddress?.id ?? addresses[0]?.id ?? null;
  const selectedAddress = addresses.find((address) => address.id === effectiveAddressId) ?? null;

  const cartSignature = useMemo(
    () =>
      JSON.stringify({
        restaurantId: cart.restaurantId,
        items: cart.items.map((item) => [item.menuItemId, item.quantity]),
      }),
    [cart.restaurantId, cart.items],
  );

  // A different cart is a different checkout intent, so it gets a fresh key.
  useEffect(() => {
    idempotencyKeyRef.current = newIdempotencyKey();
    setSubmitError('');
  }, [cartSignature]);

  const quoteKey = JSON.stringify({
    restaurantId: cart.restaurantId,
    addressId: effectiveAddressId,
    items: cart.items.map((item) => [item.menuItemId, item.quantity]),
  });

  const {
    data: quote,
    loading: quoteLoading,
    error: quoteError,
    reload: reloadQuote,
  } = useAsyncData(async () => {
    if (!cart.restaurantId || !effectiveAddressId || cart.items.length === 0) return null;
    const response = await quoteOrder({
      restaurantId: cart.restaurantId,
      addressId: effectiveAddressId,
      items: cart.items.map((item) => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
      })),
    });
    return response.quote;
  }, [quoteKey]);

  const quoteItems = quote?.items ?? cart.items.map((item) => ({
    menu_item_id: item.menuItemId,
    item_name: item.name,
    quantity: item.quantity,
    unit_price_minor: item.priceMinor,
    line_total_minor: item.priceMinor * item.quantity,
  }));

  const canSubmit =
    Boolean(quote) &&
    !quoteLoading &&
    !quoteError &&
    Boolean(selectedAddress) &&
    cart.count > 0 &&
    !submitting;

  const readiness = [
    {
      label: 'Cart contains dishes',
      ok: cart.count > 0,
      detail: `${cart.count} item${cart.count === 1 ? '' : 's'} from one kitchen`,
    },
    {
      label: 'Delivery address selected',
      ok: Boolean(selectedAddress),
      detail: selectedAddress ? selectedAddress.label : 'Add or choose an address',
    },
    {
      label: 'Server-verified totals',
      ok: Boolean(quote) && !quoteError,
      detail: quote
        ? `Delivery fee ${formatCurrency(quote.delivery_fee_minor, quote.currency)}`
        : quoteError?.message || 'Waiting for a trusted quote',
    },
    {
      label: 'Cash on delivery',
      ok: true,
      detail: 'No card is charged in this phase',
    },
  ];

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    if (!canSubmit || !quote) return;

    setSubmitting(true);
    try {
      const result = await createCustomerOrder({
        restaurantId: cart.restaurantId,
        addressId: effectiveAddressId,
        items: cart.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        })),
        specialInstructions: instructions,
        idempotencyKey: idempotencyKeyRef.current,
        paymentMethod: 'cash_on_delivery',
      });

      cart.clear();
      navigate(`/customer/orders/${result.order.id}`, {
        state: { justCreated: true, duplicate: Boolean(result.duplicate) },
      });
    } catch (submitFailure) {
      setSubmitError(submitFailure.message ?? 'The order could not be created.');
      if (['INVALID_STATE', 'STATE_CONFLICT', 'CONFLICT'].includes(submitFailure.code)) {
        // Prices, availability or the kitchen hours may have changed.
        reloadQuote();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.count === 0) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Checkout review" title="Nothing to check out" />
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Add dishes from one active kitchen before reviewing a checkout."
          action={<LinkButton to="/customer" icon={Store}>Discover kitchens</LinkButton>}
        />
      </div>
    );
  }

  if (loading) return <LoadingState rows={4} label="Loading saved delivery addresses" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="space-y-5">
      <Link to="/customer/cart" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to cart
      </Link>

      <PageHeader
        eyebrow="Checkout review"
        title="Review your order"
        description="Prices, fees and the delivery window are recalculated by the trusted order service before you confirm."
        actions={<LinkButton to="/customer/cart" variant="secondary" icon={ShoppingBag}>Edit cart</LinkButton>}
      />

      <InlineNotice tone="success" title="Trusted checkout is enabled">
        <span className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          The Worker re-reads menu availability and prices, calculates the total in integer minor
          units, and creates the order atomically. Payment is cash on delivery only.
        </span>
      </InlineNotice>

      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Delivery address"
              description="Choose one saved address. The trusted quote checks that it belongs to your account."
              action={
                <Link to="/customer/profile" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Manage
                </Link>
              }
            />

            {addresses.length ? (
              <CardBody>
                <fieldset>
                  <legend className="sr-only">Choose a delivery address</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {addresses.map((address) => {
                      const selected = address.id === effectiveAddressId;
                      return (
                        <label
                          key={address.id}
                          className={`flex cursor-pointer gap-3 rounded-xl border p-3.5 transition ${
                            selected ? 'border-accent bg-warm' : 'border-line bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="delivery-address"
                            value={address.id}
                            checked={selected}
                            onChange={() => setSelectedAddressId(address.id)}
                            className="mt-1 h-4 w-4 shrink-0 accent-orange-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-ink">{address.label}</span>
                              {address.is_default ? <Badge variant="green">Default</Badge> : null}
                            </span>
                            <span className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                              <UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                              {address.recipient_name}
                              {address.phone ? <span className="font-normal text-muted">· {address.phone}</span> : null}
                            </span>
                            <span className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-muted">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                              {formatAddress(address)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </CardBody>
            ) : (
              <div className="p-4">
                <EmptyState
                  compact
                  icon={MapPin}
                  title="No delivery address saved"
                  description="Add a delivery address to your profile before a trusted checkout can accept an order."
                  action={<LinkButton to="/customer/profile" size="sm" icon={Plus}>Add an address</LinkButton>}
                />
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Delivery notes"
              description="Stored with the order and visible to the kitchen and delivery partner."
            />
            <CardBody>
              <LabeledTextarea
                label="Instructions for the kitchen or rider"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Gate code, landmark, packaging note…"
                hint="Optional, up to 280 characters."
                maxLength={280}
              />
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                  The delivery window is calculated by the order service, not chosen arbitrarily.
                </span>
                <span className="tabular-nums">{instructions.length}/280</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Server validation"
              description="What the trusted order service checks before creating the order."
            />
            <CardBody>
              <ol className="space-y-3">
                {[
                  ['Menu items and prices', 'Re-read from menu_items; unavailable or cross-restaurant items are rejected.'],
                  ['Kitchen hours and address ownership', 'The restaurant must be open and the address must belong to you.'],
                  ['Integer totals', 'Subtotal, delivery fee and total are calculated and stored in minor units.'],
                  ['Atomic, idempotent creation', 'One order, one set of lines, and duplicate submissions return the same order.'],
                ].map(([title, detail], index) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[0.65rem] font-bold text-slate-600">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-ink">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-muted">{detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader
              title="Order summary"
              description={quote?.restaurant_name || cart.restaurantName || 'One kitchen per cart'}
            />
            <CardBody className="space-y-3">
              <ul className="space-y-2">
                {quoteItems.map((item) => (
                  <li key={item.menu_item_id} className="flex items-start justify-between gap-3 text-xs">
                    <span className="min-w-0 text-slate-700">
                      <span className="font-bold">{item.quantity}×</span> {item.item_name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                      {formatCurrency(item.line_total_minor, quote?.currency ?? 'INR')}
                    </span>
                  </li>
                ))}
              </ul>

              {quoteError ? (
                <InlineNotice tone="danger" title="The quote could not be calculated">
                  <span className="block text-xs leading-5">{quoteError.message}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    onClick={reloadQuote}
                    className="mt-2"
                  >
                    Recalculate
                  </Button>
                </InlineNotice>
              ) : null}

              <div className="space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Item subtotal</span>
                  <span className="font-bold tabular-nums text-ink">
                    {formatCurrency(quote?.subtotal_minor ?? cart.subtotalMinor, quote?.currency ?? 'INR')}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Delivery fee</span>
                  <span className="font-semibold tabular-nums text-slate-700">
                    {quoteLoading
                      ? 'Calculating…'
                      : quote
                        ? quote.delivery_fee_minor === 0
                          ? 'Free'
                          : formatCurrency(quote.delivery_fee_minor, quote.currency)
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Delivery window</span>
                  <span className="text-right font-semibold text-slate-700">
                    {quote
                      ? formatWindow(quote.delivery_window_start, quote.delivery_window_end)
                      : quoteLoading
                        ? 'Calculating…'
                        : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Payment</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                    <Wallet className="h-3.5 w-3.5" aria-hidden="true" /> Cash on delivery
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Order total</span>
                <span className="font-display text-lg font-bold tabular-nums text-ink">
                  {quote ? formatCurrency(quote.total_minor, quote.currency) : '—'}
                </span>
              </div>

              {quote?.is_restaurant_open === false ? (
                <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-[0.68rem] font-semibold text-amber-900">
                  This kitchen is currently closed.
                </p>
              ) : null}

              {submitError ? (
                <InlineNotice tone="danger" title="Order not created">
                  <span className="text-xs leading-5">{submitError}</span>
                </InlineNotice>
              ) : null}

              <Button
                type="submit"
                icon={Truck}
                loading={submitting}
                disabled={!canSubmit}
                className="w-full"
              >
                {submitting ? 'Creating order…' : 'Place cash-on-delivery order'}
              </Button>
              <p className="text-[0.68rem] leading-4 text-muted">
                Double submissions are protected by a checkout idempotency key. If the network drops
                after the order is written, retrying returns the same order instead of creating another.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Readiness check" description="What has been verified." />
            <CardBody>
              <ul className="space-y-2.5">
                {readiness.map((item) => (
                  <li key={item.label} className="flex items-start gap-2.5">
                    {item.ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                    )}
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-ink">{item.label}</span>
                      <span className="block text-[0.68rem] leading-4 text-muted">{item.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>

          <InlineNotice tone="neutral" title="Your cart stays local until you confirm">
            <span className="flex items-start gap-2">
              <ShoppingBag className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Nothing is ordered until the trusted endpoint returns a real order reference.
            </span>
          </InlineNotice>
        </aside>
      </form>
    </div>
  );
}

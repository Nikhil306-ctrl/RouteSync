import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Leaf,
  MapPin,
  Minus,
  Plus,
  SearchX,
  ShoppingBag,
  Star,
  Store,
  UtensilsCrossed,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { Card, CardBody, CardHeader, DefinitionItem } from '../../../components/ui/Card.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import Button, { LinkButton } from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import FoodImage from '../../../components/FoodImage.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useCart } from '../../../hooks/useCart.jsx';
import { formatCurrency, formatTime } from '../../../lib/format.js';
import { menuItemImage, restaurantImage } from '../../../lib/images.js';
import { isRestaurantOpenNow } from '../../../lib/hours.js';
import { getRestaurantBySlug, listRestaurantMenu } from '../../../services/restaurants.js';

function toCartPayload(item, restaurant) {
  return {
    menuItemId: item.id,
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    name: item.name,
    priceMinor: item.price_minor,
    imageUrl: item.image_url,
  };
}

export default function RestaurantDetail() {
  const { slug } = useParams();
  const cart = useCart();
  const [selectedItem, setSelectedItem] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [conflict, setConflict] = useState(null);
  const [notice, setNotice] = useState('');

  const { data, loading, error, reload } = useAsyncData(async () => {
    const restaurant = await getRestaurantBySlug(slug);
    if (!restaurant) return { restaurant: null, categories: [], items: [] };
    const menu = await listRestaurantMenu(restaurant.id);
    return { restaurant, ...menu };
  }, [slug]);

  useDocumentTitle(data?.restaurant?.name ?? 'Restaurant menu');

  const groupedMenu = useMemo(() => {
    if (!data?.restaurant) return [];
    const activeCategories = [...data.categories]
      .filter((category) => category.is_active)
      .sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
    const availableItems = data.items.filter((item) => item.is_available);

    const sections = activeCategories
      .map((category) => ({
        id: category.id,
        name: category.name,
        items: availableItems.filter((item) => item.category_id === category.id),
      }))
      .filter((section) => section.items.length > 0);

    const uncategorised = availableItems.filter(
      (item) => !item.category_id || !activeCategories.some((category) => category.id === item.category_id),
    );
    if (uncategorised.length) {
      sections.push({ id: 'uncategorised', name: 'More from this kitchen', items: uncategorised });
    }
    return sections;
  }, [data]);

  const restaurant = data?.restaurant;
  const image = restaurant ? restaurantImage(restaurant) : null;
  const openNow = restaurant ? isRestaurantOpenNow(restaurant) : false;
  const cartFromThisRestaurant = cart.items.length === 0 || cart.restaurantId === restaurant?.id;
  const canAddToCart = openNow && cartFromThisRestaurant;
  const cartItemFor = (menuItemId) => cart.items.find((item) => item.menuItemId === menuItemId);

  const openItem = (item) => {
    setSelectedItem(item);
    setQuantity(cartItemFor(item.id)?.quantity ?? 1);
    setNotice('');
  };

  const addToCart = (item, amount = 1) => {
    if (!restaurant) return;
    const payload = toCartPayload(item, restaurant);
    const result = cart.addItem(payload, amount);
    if (result.conflict) {
      setConflict({ item: payload, quantity: amount, name: item.name });
      setSelectedItem(null);
      return;
    }
    setNotice(`${item.name} added to your cart.`);
    setSelectedItem(null);
  };

  const replaceCart = () => {
    if (!conflict) return;
    cart.replaceCart(conflict.item, conflict.quantity);
    setNotice(`${conflict.name} added. Your previous cart was replaced.`);
    setConflict(null);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingState rows={2} label="Loading restaurant" />
        <div className="h-52 skeleton-shimmer rounded-2xl" aria-hidden="true" />
        <LoadingState rows={5} label="Loading the menu" />
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!restaurant) {
    return (
      <div className="space-y-4">
        <Link to="/customer" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All kitchens
        </Link>
        <EmptyState
          icon={Store}
          title="This restaurant is not available"
          description="The listing may be inactive or removed from the public catalogue. Browse other active kitchens instead."
          action={<LinkButton to="/customer" icon={SearchX}>Browse restaurants</LinkButton>}
        />
      </div>
    );
  }

  const totalAvailable = groupedMenu.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <div className="space-y-5">
      <Link to="/customer" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All kitchens
      </Link>

      <section className="rs-panel overflow-hidden">
        <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
          <div className="relative h-56 bg-slate-100 sm:h-72 lg:h-full lg:min-h-[300px]">
            <FoodImage src={image.src} alt={image.alt} fallback="restaurant" loading="eager" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={restaurant.is_active && openNow ? 'green' : 'red'} dot>
                  {restaurant.is_active ? (openNow ? 'Open now' : 'Closed now') : 'Inactive listing'}
                </Badge>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[0.68rem] font-bold backdrop-blur">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                  {Number(restaurant.rating).toFixed(1)}
                </span>
              </div>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">{restaurant.name}</h1>
              <p className="mt-1 text-sm text-slate-200">{restaurant.cuisine_type || 'Local kitchen'} · {restaurant.default_prep_time_minutes} min preparation estimate</p>
            </div>
          </div>

          <div className="flex flex-col justify-between p-5 sm:p-6">
            <div>
              <p className="text-sm leading-6 text-slate-600">
                {restaurant.description || 'This kitchen has not added a public description yet.'}
              </p>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                <DefinitionItem label="Address">
                  <span className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
                    {restaurant.address_line}
                    {restaurant.landmark ? `, ${restaurant.landmark}` : ''}<br />
                    {restaurant.city}, {restaurant.state} {restaurant.pincode || ''}
                  </span>
                </DefinitionItem>
                <DefinitionItem label="Recorded hours">
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {formatTime(restaurant.opening_time)} – {formatTime(restaurant.closing_time)}
                  </span>
                </DefinitionItem>
              </dl>
            </div>

            <div className="mt-5 rounded-xl border border-orange-200 bg-warm p-3.5">
              <p className="flex items-center gap-2 text-xs font-bold text-orange-950">
                <Clock3 className="h-4 w-4 text-accent" aria-hidden="true" />
                Scheduling context
              </p>
              <p className="mt-1 text-xs leading-5 text-orange-950/80">
                Preparation and delivery feasibility are validated by the trusted order and scheduling flow.
                This page does not promise a delivery time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {!openNow ? (
        <InlineNotice tone="warning" title="This kitchen is currently closed">
          Recorded hours are {formatTime(restaurant.opening_time)} – {formatTime(restaurant.closing_time)}. You can
          browse the menu, but the trusted checkout will reject a new order until the kitchen is open again.
        </InlineNotice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_330px] xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="rs-eyebrow text-accent">Menu</p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink">Available dishes</h2>
              <p className="mt-1 text-xs text-muted">{totalAvailable} available item{totalAvailable === 1 ? '' : 's'} across {groupedMenu.length} section{groupedMenu.length === 1 ? '' : 's'}.</p>
            </div>
            {cart.count ? (
              <Link to="/customer/cart" className="inline-flex items-center gap-1.5 text-xs font-bold text-accent hover:text-accent-strong">
                <ShoppingBag className="h-4 w-4" aria-hidden="true" /> Cart · {cart.count} items
              </Link>
            ) : null}
          </div>

          {notice ? (
            <div role="status">
              <InlineNotice tone="success">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</span>
                  <Link to="/customer/cart" className="font-bold underline underline-offset-2">View cart</Link>
                </span>
              </InlineNotice>
            </div>
          ) : null}

          {groupedMenu.length ? (
            groupedMenu.map((section) => (
              <section key={section.id} className="rs-panel overflow-hidden">
                <CardHeader title={section.name} description={`${section.items.length} available item${section.items.length === 1 ? '' : 's'}`} />
                <div className="divide-y divide-line">
                  {section.items.map((item) => {
                    const foodImage = menuItemImage(item);
                    const inCart = cartItemFor(item.id);
                    return (
                      <article key={item.id} className="flex gap-3.5 p-3.5 sm:p-4">
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-24 sm:w-24"
                          aria-label={`View ${item.name}`}
                        >
                          <FoodImage src={foodImage.src} alt={foodImage.alt} />
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <button type="button" onClick={() => openItem(item)} className="text-left">
                                <h3 className="text-sm font-bold text-ink hover:text-accent">{item.name}</h3>
                              </button>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{item.description || 'No description provided.'}</p>
                            </div>
                            <p className="shrink-0 text-sm font-bold tabular-nums text-ink">{formatCurrency(item.price_minor, item.currency)}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] font-semibold text-muted">
                            <span className="inline-flex items-center gap-1">
                              <span className={`h-2 w-2 rounded-full ${item.is_vegetarian ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                              {item.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
                            </span>
                            <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" />{item.prep_time_minutes} min</span>
                            {inCart ? <span className="rounded-full bg-orange-100 px-2 py-0.5 font-bold text-orange-800">{inCart.quantity} in cart</span> : null}
                          </div>
                          <div className="mt-2.5 flex items-center gap-2">
                            <Button
                              size="sm"
                              icon={Plus}
                              onClick={() => addToCart(item, 1)}
                              disabled={!canAddToCart}
                              title={
                                !openNow
                                  ? 'This kitchen is closed right now.'
                                  : !cartFromThisRestaurant
                                    ? 'Your cart already contains dishes from another restaurant.'
                                    : undefined
                              }
                            >
                              Add
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => openItem(item)}>Details</Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          ) : (
            <EmptyState
              icon={UtensilsCrossed}
              title="No available menu items"
              description="This kitchen has no publicly available dishes right now. Nothing is substituted or invented."
            />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader title="Your cart" description={cart.count ? `${cart.count} item${cart.count === 1 ? '' : 's'} · one kitchen per cart` : 'Build an order from one kitchen.'} />
            <CardBody className="space-y-3">
              {cart.count ? (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-slate-50 px-3 py-2">
                    <span className="min-w-0 truncate text-xs font-bold text-ink">{cart.restaurantName}</span>
                    <span className="shrink-0 text-xs text-muted">{cart.count} items</span>
                  </div>
                  {cart.restaurantId !== restaurant.id ? (
                    <InlineNotice tone="warning">
                      These items are from another kitchen. Adding a dish here asks before replacing the cart.
                    </InlineNotice>
                  ) : null}
                  <ul className="space-y-2">
                    {cart.items.slice(0, 4).map((item) => (
                      <li key={item.menuItemId} className="flex items-start justify-between gap-2 text-xs">
                        <span className="min-w-0"><span className="font-bold text-slate-700">{item.quantity}×</span> <span className="text-slate-600">{item.name}</span></span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-700">{formatCurrency(item.priceMinor * item.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                  {cart.items.length > 4 ? <p className="text-xs text-muted">+{cart.items.length - 4} more items in the cart</p> : null}
                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs font-semibold text-muted">Item subtotal</span>
                    <span className="font-display text-lg font-bold tabular-nums text-ink">{formatCurrency(cart.subtotalMinor)}</span>
                  </div>
                  <p className="text-[0.68rem] leading-4 text-muted">Fees, taxes and the delivery window are calculated by the trusted checkout flow.</p>
                  <LinkButton to="/customer/cart" icon={ShoppingBag} className="w-full">Open cart</LinkButton>
                </>
              ) : (
                <div className="py-3 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-warm text-accent">
                    <ShoppingBag className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 text-sm font-bold text-ink">Your cart is empty</p>
                  <p className="mt-1 text-xs leading-5 text-muted">Add a dish to start an order from this kitchen.</p>
                </div>
              )}
            </CardBody>
          </Card>

          <InlineNotice tone="neutral" title="What is real here">
            <span className="flex items-start gap-2">
              <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              Menu names, prices, dietary markers and preparation estimates are database values. Adding to cart is
              local to this browser; checkout prices, fees and totals are recalculated by the trusted order service.
            </span>
          </InlineNotice>
        </aside>
      </div>

      <PageHeader
        title="Planning a group meal?"
        description="A single cart stays within one restaurant so pickup remains unambiguous. Add multiple quantities from this menu, then review the whole cart."
        actions={<LinkButton to="/customer/cart" variant="secondary" icon={ShoppingBag}>Review cart</LinkButton>}
      />

      <Modal
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.name ?? 'Menu item'}
        description={selectedItem ? `${formatCurrency(selectedItem.price_minor, selectedItem.currency)} · ${selectedItem.prep_time_minutes} min preparation estimate` : ''}
      >
        {selectedItem ? (
          <div className="space-y-4">
            <div className="h-52 overflow-hidden rounded-xl border border-line bg-slate-100">
              <FoodImage src={menuItemImage(selectedItem).src} alt={menuItemImage(selectedItem).alt} loading="eager" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={selectedItem.is_vegetarian ? 'green' : 'red'}>
                {selectedItem.is_vegetarian ? 'Vegetarian' : 'Non-vegetarian'}
              </Badge>
              <Badge variant="neutral">{selectedItem.prep_time_minutes} min prep</Badge>
            </div>
            <p className="text-sm leading-6 text-slate-600">{selectedItem.description || 'No description provided for this dish.'}</p>

            <div className="flex flex-col gap-3 rounded-lg border border-line bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="rs-label">Quantity</p>
                <p className="mt-0.5 text-xs text-muted">Maximum 50 per dish.</p>
              </div>
              <div className="inline-flex items-center rounded-lg border border-line bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                  disabled={quantity <= 1}
                  className="grid h-10 w-10 place-items-center text-slate-600 disabled:text-slate-300"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-4 w-4" aria-hidden="true" />
                </button>
                <span className="min-w-10 text-center text-sm font-bold tabular-nums text-ink" aria-live="polite">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((current) => Math.min(50, current + 1))}
                  disabled={quantity >= 50}
                  className="grid h-10 w-10 place-items-center text-slate-600 disabled:text-slate-300"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {!openNow ? (
              <InlineNotice tone="warning">
                This kitchen is closed right now. Items can be reviewed, but they cannot be added until the
                recorded opening hours reopen the kitchen.
              </InlineNotice>
            ) : !cartFromThisRestaurant ? (
              <InlineNotice tone="warning">
                Your cart currently contains dishes from {cart.restaurantName}. Adding this dish requires starting a new cart.
              </InlineNotice>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>Keep browsing</Button>
              <Button
                icon={ShoppingBag}
                onClick={() => addToCart(selectedItem, quantity)}
                disabled={!canAddToCart}
              >
                Add {quantity} to cart · {formatCurrency(selectedItem.price_minor * quantity, selectedItem.currency)}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(conflict)}
        onClose={() => setConflict(null)}
        title="Start a new cart?"
        description="A cart can only contain dishes from one restaurant."
        size="sm"
      >
        {conflict ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              Your current cart contains dishes from <strong>{cart.restaurantName}</strong>. Adding{' '}
              <strong>{conflict.name}</strong> will replace those items.
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setConflict(null)}>Keep current cart</Button>
              <Button icon={ArrowRight} onClick={replaceCart}>Start new cart</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

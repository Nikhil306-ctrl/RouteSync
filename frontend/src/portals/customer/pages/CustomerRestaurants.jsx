import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  MapPin,
  Search,
  ShoppingBag,
  Star,
  Store,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Badge from '../../../components/ui/Badge.jsx';
import { Card, CardBody } from '../../../components/ui/Card.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States.jsx';
import { Input } from '../../../components/ui/Field.jsx';
import FoodImage from '../../../components/FoodImage.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useCart } from '../../../hooks/useCart.jsx';
import { formatCurrency, formatTime } from '../../../lib/format.js';
import { restaurantImage } from '../../../lib/images.js';
import { isRestaurantOpenNow } from '../../../lib/hours.js';
import { listPublicMenuSummary, listPublicRestaurants } from '../../../services/restaurants.js';

const isOpenNow = (restaurant) => isRestaurantOpenNow(restaurant);

export default function CustomerRestaurants() {
  useDocumentTitle('Discover kitchens');
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState('all');
  const { count, subtotalMinor } = useCart();

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [restaurants, menuItems] = await Promise.all([
      listPublicRestaurants(),
      listPublicMenuSummary(),
    ]);
    return { restaurants, menuItems };
  }, []);

  const menuByRestaurant = useMemo(() => {
    const map = new Map();
    for (const item of data?.menuItems ?? []) {
      const list = map.get(item.restaurant_id) ?? [];
      list.push(item);
      map.set(item.restaurant_id, list);
    }
    return map;
  }, [data]);

  const cuisines = useMemo(
    () => [...new Set((data?.restaurants ?? []).map((restaurant) => restaurant.cuisine_type).filter(Boolean))].sort(),
    [data],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.restaurants ?? []).filter((restaurant) => {
      if (cuisine !== 'all' && restaurant.cuisine_type !== cuisine) return false;
      if (!query) return true;
      const dishes = menuByRestaurant.get(restaurant.id) ?? [];
      return [
        restaurant.name,
        restaurant.cuisine_type,
        restaurant.description,
        restaurant.address_line,
        restaurant.landmark,
        ...dishes.map((dish) => dish.name),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, cuisine, menuByRestaurant]);

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingState rows={3} label="Loading local kitchens" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((key) => (
            <div key={key} className="overflow-hidden rounded-xl border border-line bg-white">
              <div className="h-44 skeleton-shimmer" aria-hidden="true" />
              <div className="space-y-3 p-4">
                <div className="h-4 w-1/2 skeleton-shimmer rounded" aria-hidden="true" />
                <div className="h-3 w-2/3 skeleton-shimmer rounded" aria-hidden="true" />
                <div className="h-3 w-full skeleton-shimmer rounded" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const openNow = data.restaurants.filter(isOpenNow).length;
  const heroImages = data.restaurants.slice(0, 3);
  const hasFilters = search || cuisine !== 'all';

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-slate-700 bg-ink text-white">

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="rs-eyebrow text-orange-300">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              Customer ordering · Belagavi
            </p>
            <h1 className="mt-3 max-w-xl font-display text-3xl font-extrabold leading-[1.12] tracking-tight sm:text-4xl">
              Find a kitchen you trust, then follow the order.
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300">
              Browse the real restaurant catalogue, inspect preparation times and build a cart.
              Delivery windows and feasibility are confirmed by the trusted order flow — not invented here.
            </p>

            <div className="mt-5 flex max-w-lg flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <label htmlFor="restaurant-search" className="sr-only">Search restaurants or dishes</label>
                <Input
                  id="restaurant-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search kitchens, cuisines or dishes…"
                  className="border-white/15 bg-white pl-10"
                />
              </div>
              <Link
                to="/customer/cart"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-strong"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                Cart{count ? ` · ${count}` : ''}
              </Link>
            </div>
            {count ? (
              <p className="mt-2 text-xs text-slate-400">
                Current cart subtotal {formatCurrency(subtotalMinor)}. One restaurant per cart.
              </p>
            ) : null}
          </div>

          <div className="hidden gap-2 sm:grid sm:grid-cols-3 lg:grid">
            {heroImages.map((restaurant) => {
              const image = restaurantImage(restaurant);
              return (
                <Link
                  key={restaurant.id}
                  to={`/customer/restaurants/${restaurant.slug}`}
                  className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/10"
                >
                  <div className="h-full w-full">
                    <FoodImage src={image.src} alt={image.alt} fallback="restaurant" className="transition duration-500 group-hover:scale-[1.04]" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" aria-hidden="true" />
                  <div className="absolute inset-x-0 bottom-0 p-2.5">
                    <p className="line-clamp-2 text-[0.7rem] font-bold leading-4 text-white">{restaurant.name}</p>
                    <p className="mt-0.5 text-[0.6rem] text-slate-300">{restaurant.cuisine_type}</p>
                  </div>
                </Link>
              );
            })}
            {heroImages.length === 0 ? (
              <div className="col-span-3 grid place-items-center rounded-xl border border-dashed border-white/20 p-8 text-xs text-slate-400">
                No active restaurants in the catalogue yet.
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Active kitchens', value: data.restaurants.length, icon: Store },
          { label: 'Menu items', value: data.menuItems.length, icon: UtensilsCrossed },
          { label: 'Cuisines', value: cuisines.length, icon: MapPin },
          { label: 'Open now', value: openNow, icon: Clock3 },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rs-panel flex items-center gap-3 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warm text-accent">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="font-display text-xl font-bold leading-none text-ink">{stat.value}</p>
                <p className="mt-1 text-xs font-medium text-muted">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="rs-eyebrow text-accent">Browse the catalogue</p>
          <h2 className="mt-1 font-display text-xl font-bold text-ink">
            {hasFilters ? `${filtered.length} matching kitchen${filtered.length === 1 ? '' : 's'}` : 'Local kitchens'}
          </h2>
        </div>
        <div className="hide-scrollbar overflow-x-auto">
          <div className="flex min-w-max items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCuisine('all')}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                cuisine === 'all' ? 'border-ink bg-ink text-white' : 'border-line bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              All cuisines
            </button>
            {cuisines.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setCuisine(value)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
                  cuisine === value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {value}
              </button>
            ))}
            {hasFilters ? (
              <button
                type="button"
                onClick={() => { setSearch(''); setCuisine('all'); }}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {filtered.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((restaurant) => {
            const image = restaurantImage(restaurant);
            const dishes = menuByRestaurant.get(restaurant.id) ?? [];
            const query = search.trim().toLowerCase();
            const matched = query
              ? dishes.filter((dish) => dish.name.toLowerCase().includes(query))
              : [];
            const preview = (matched.length ? matched : dishes).slice(0, 3);
            return (
              <article
                key={restaurant.id}
                className="rs-panel group flex flex-col overflow-hidden transition hover:border-orange-200 hover:shadow-[0_10px_24px_rgba(15,23,42,0.06)]"
              >
                <Link to={`/customer/restaurants/${restaurant.slug}`} className="relative block aspect-[16/10] overflow-hidden bg-slate-100">
                  <FoodImage
                    src={image.src}
                    alt={image.alt}
                    fallback="restaurant"
                    className="transition duration-500 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                    <Badge variant={isOpenNow(restaurant) ? 'green' : 'neutral'} dot>
                      {isOpenNow(restaurant) ? 'Open now' : 'Hours recorded'}
                    </Badge>
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink/85 px-2 py-1 text-[0.65rem] font-bold text-white backdrop-blur">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                      {Number(restaurant.rating).toFixed(1)}
                    </span>
                  </div>
                </Link>

                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/customer/restaurants/${restaurant.slug}`} className="focus-visible:rounded">
                        <h3 className="font-display text-base font-bold text-ink group-hover:text-accent">{restaurant.name}</h3>
                      </Link>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">
                        {restaurant.cuisine_type || 'Local kitchen'} · {restaurant.default_prep_time_minutes} min prep
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-600">{restaurant.description || 'Menu details available on the restaurant page.'}</p>

                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="line-clamp-1">{restaurant.address_line}, {restaurant.city}</span>
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                    <Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {formatTime(restaurant.opening_time)} – {formatTime(restaurant.closing_time)}
                  </p>

                  <div className="mt-3 flex-1 rounded-lg border border-line bg-slate-50/70 p-2.5">
                    <p className="text-xs font-semibold text-muted">
                      {matched.length ? 'Matching dishes' : 'From the menu'}
                    </p>
                    {preview.length ? (
                      <ul className="mt-1.5 space-y-1">
                        {preview.map((dish) => (
                          <li key={dish.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dish.is_vegetarian ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />
                              <span className="truncate text-slate-700">{dish.name}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-600">{formatCurrency(dish.price_minor, dish.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-xs text-muted">No available menu items listed.</p>
                    )}
                  </div>

                  <Link
                    to={`/customer/restaurants/${restaurant.slug}`}
                    className="mt-3 inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink hover:border-slate-300 hover:bg-slate-50"
                  >
                    View menu <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={UtensilsCrossed}
          title={hasFilters ? 'No kitchens match your search' : 'No active restaurants yet'}
          description={
            hasFilters
              ? 'Try a different dish or cuisine, or clear the filters to browse the full catalogue.'
              : 'Active restaurant listings will appear here once the catalogue contains them. Nothing is filled with demo cards.'
          }
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={() => { setSearch(''); setCuisine('all'); }}
                className="inline-flex min-h-9 items-center rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-bold text-ink hover:bg-slate-50"
              >
                Clear filters
              </button>
            ) : null
          }
        />
      )}

      <PageHeader
        title="How this catalogue behaves"
        description="Listings and prices come from the Supabase restaurant and menu tables. Availability and catalogue visibility follow row-level security, not a local mock."
      />

      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-3">
          {[
            ['Real catalogue', 'Restaurants, cuisines, menu items and prices are read from active database rows.'],
            ['One kitchen per cart', 'A cart can contain multiple dishes from one restaurant so the pickup point stays unambiguous.'],
            ['Trusted totals', 'Checkout explains the Phase 5 boundary instead of inventing fees, delivery windows or order success.'],
          ].map(([title, detail]) => (
            <div key={title}>
              <p className="text-xs font-bold text-ink">{title}</p>
              <p className="mt-1 text-xs leading-5 text-muted">{detail}</p>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

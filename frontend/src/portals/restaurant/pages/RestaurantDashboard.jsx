import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  Clock3,
  CookingPot,
  ShieldAlert,
  Store,
  Timer,
  UtensilsCrossed,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, CardHeader, StatCard } from '../../../components/ui/Card.jsx';
import { StatusBadge } from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { LinkButton } from '../../../components/ui/Button.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatCurrency, formatTime, formatWindow, isSameDay } from '../../../lib/format.js';
import { getOwnerRestaurant, listRestaurantMenu } from '../../../services/restaurants.js';
import { listOrders, orderMetrics } from '../../../services/orders.js';

export default function RestaurantDashboard() {
  useDocumentTitle('Restaurant overview');
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsyncData(async () => {
    const restaurant = await getOwnerRestaurant(user.id);
    if (!restaurant) return { restaurant: null, menu: { categories: [], items: [] }, orders: [] };
    const [menu, orders] = await Promise.all([
      listRestaurantMenu(restaurant.id),
      listOrders({ restaurantId: restaurant.id, limit: 250 }),
    ]);
    return { restaurant, menu, orders };
  }, [user.id]);

  if (loading) return <LoadingState rows={4} label="Loading restaurant workspace" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  if (!data.restaurant) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Restaurant workspace" title="Restaurant profile not found" />
        <EmptyState
          icon={Store}
          title="No restaurant is linked to this account"
          description="Your owner account exists, but no restaurant record is linked to it. Ask an administrator to complete restaurant provisioning."
        />
      </div>
    );
  }

  const { restaurant, menu, orders } = data;
  const metrics = orderMetrics(orders);
  const todayOrders = orders.filter((order) => isSameDay(order.created_at));
  const todayDelivered = todayOrders.filter((order) => order.status === 'delivered');
  const availableItems = menu.items.filter((item) => item.is_available).length;
  const kitchenOrders = orders.filter((order) => ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)).slice(0, 6);
  const lowAvailability = menu.items.length === 0 || availableItems / menu.items.length < 0.5;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Restaurant workspace"
        title={restaurant.name}
        description={`${restaurant.cuisine_type || 'Restaurant'} · ${restaurant.address_line}, ${restaurant.city}`}
        actions={
          <>
            <LinkButton to="/restaurant/menu" variant="secondary" icon={UtensilsCrossed}>Menu</LinkButton>
            <LinkButton to="/restaurant/kitchen" icon={CookingPot}>Open kitchen board</LinkButton>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Incoming" value={metrics.pending} helper="Pending restaurant confirmation" icon={ClipboardList} tone="orange" />
        <StatCard label="In preparation" value={metrics.preparing} helper="Confirmed, preparing or assigned" icon={CookingPot} />
        <StatCard label="Ready for pickup" value={metrics.ready} helper="Awaiting hand-off" icon={Timer} tone="green" />
        <StatCard label="Menu available" value={`${availableItems}/${menu.items.length}`} helper={`${menu.categories.length} categories`} icon={UtensilsCrossed} tone={lowAvailability ? 'orange' : 'default'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader
            title="Kitchen queue"
            description="The next orders that need restaurant action."
            action={<Link to="/restaurant/kitchen" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">Kitchen board <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>}
          />
          {kitchenOrders.length ? (
            <div className="divide-y divide-line">
              {kitchenOrders.map((order) => (
                <div key={order.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500">#{order.id.slice(0, 8)}</span>
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.priority} dot={false} />
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{order.items?.map((item) => `${item.quantity}× ${item.item_name}`).join(' · ') || 'Order lines unavailable'}</p>
                      <p className="mt-0.5 text-xs text-muted">{order.delivery_address_line}</p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-xs font-bold text-slate-700">{formatWindow(order.delivery_window_start, order.delivery_window_end)}</p>
                      <p className="mt-0.5 text-xs text-muted">{formatCurrency(order.total_minor, order.currency)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                compact
                icon={CookingPot}
                title="The kitchen queue is clear"
                description="New pending orders will appear here. No placeholder orders are shown."
                action={<LinkButton to="/restaurant/kitchen" size="sm" variant="secondary">View board</LinkButton>}
              />
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Service profile" description="Current restaurant settings and availability." />
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Listing status</span>
                <StatusBadge status={restaurant.is_active ? 'active' : 'inactive'} />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Opening hours</span>
                <span className="text-xs font-bold text-ink">{formatTime(restaurant.opening_time)} – {formatTime(restaurant.closing_time)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-line p-3">
                <span className="text-xs font-semibold text-slate-600">Default prep time</span>
                <span className="inline-flex items-center gap-1 text-xs font-bold text-ink"><Clock3 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />{restaurant.default_prep_time_minutes} min</span>
              </div>
              <Link to="/restaurant/profile" className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:text-accent-strong">
                Edit restaurant profile <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Today" description="Recorded restaurant order activity." />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-medium text-muted">Orders</dt>
                  <dd className="mt-1 font-display text-xl font-bold text-ink">{todayOrders.length}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs font-medium text-muted">Delivered</dt>
                  <dd className="mt-1 font-display text-xl font-bold text-ink">{todayDelivered.length}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-5 text-muted">
                Delivered value is not treated as revenue here; restaurant accounting is outside this phase.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>

      {lowAvailability ? (
        <InlineNotice tone="warning" title="Menu attention needed">
          <span className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {menu.items.length === 0
              ? 'This restaurant has no menu items yet. Add items so customers can build an order.'
              : 'Less than half of the menu is currently available. Review availability before service.'}
          </span>
        </InlineNotice>
      ) : null}
    </div>
  );
}

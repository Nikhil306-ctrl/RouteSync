import { useMemo, useState } from 'react';
import { Search, Store, UtensilsCrossed, X } from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, DefinitionItem, StatCard } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, Select } from '../../../components/ui/Field.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { formatTime } from '../../../lib/format.js';
import {
  listAdminRestaurants,
  listMenuOverviewForAdmin,
  updateRestaurant,
} from '../../../services/restaurants.js';
import { listProfilesByIds } from '../../../services/profiles.js';
import { listOrders } from '../../../services/orders.js';

export default function AdminRestaurants() {
  useDocumentTitle('Restaurant network');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [cuisine, setCuisine] = useState('all');
  const [selected, setSelected] = useState(null);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [restaurants, menuItems, orders] = await Promise.all([
      listAdminRestaurants(),
      listMenuOverviewForAdmin(),
      listOrders({ limit: 300 }),
    ]);
    const profiles = await listProfilesByIds([...new Set(restaurants.map((restaurant) => restaurant.owner_id))]);
    return { restaurants, menuItems, orders, profiles };
  }, []);

  const ownerById = useMemo(
    () => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])),
    [data],
  );

  const menuByRestaurant = useMemo(() => {
    const map = new Map();
    for (const item of data?.menuItems ?? []) {
      const entry = map.get(item.restaurant_id) ?? { total: 0, available: 0 };
      entry.total += 1;
      if (item.is_available) entry.available += 1;
      map.set(item.restaurant_id, entry);
    }
    return map;
  }, [data]);

  const ordersByRestaurant = useMemo(() => {
    const map = new Map();
    for (const order of data?.orders ?? []) {
      const entry = map.get(order.restaurant_id) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (!['delivered', 'cancelled', 'rejected'].includes(order.status)) entry.active += 1;
      map.set(order.restaurant_id, entry);
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
      if (activeFilter === 'active' && !restaurant.is_active) return false;
      if (activeFilter === 'inactive' && restaurant.is_active) return false;
      if (cuisine !== 'all' && restaurant.cuisine_type !== cuisine) return false;
      if (!query) return true;
      return [restaurant.name, restaurant.address_line, restaurant.cuisine_type, ownerById.get(restaurant.owner_id)?.full_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, activeFilter, cuisine, ownerById]);

  const openDetails = (restaurant) => {
    setSelected(restaurant);
    setConfirmToggle(false);
    setActionError('');
    setActionMessage('');
  };

  const handleToggle = async () => {
    if (!selected) return;
    setSaving(true);
    setActionError('');
    setActionMessage('');
    try {
      const updated = await updateRestaurant(selected.id, { is_active: !selected.is_active });
      setSelected(updated);
      setConfirmToggle(false);
      setActionMessage(updated.is_active ? 'Restaurant listing is active again.' : 'Restaurant listing is now hidden from the public catalogue.');
      reload();
    } catch (toggleError) {
      setActionError(toggleError.message ?? 'Unable to update the restaurant listing.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading restaurant network" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const activeCount = data.restaurants.filter((restaurant) => restaurant.is_active).length;
  const menuItems = data.menuItems.length;
  const availableItems = data.menuItems.filter((item) => item.is_available).length;
  const hasFilters = search || activeFilter !== 'all' || cuisine !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Network operations"
        title="Restaurant management"
        description="Catalogue state, operating hours and menu availability across restaurant partners."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Active listings" value={`${activeCount}/${data.restaurants.length}`} helper="Public visibility follows is_active" icon={Store} tone="green" />
        <StatCard label="Menu items" value={menuItems} helper={`${availableItems} available now`} icon={UtensilsCrossed} />
        <StatCard label="Orders recorded" value={data.orders.length} helper="All visible order records" icon={Store} tone="orange" />
      </div>

      <Card>
        <CardBody>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_160px_180px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search restaurant, owner or address…" aria-label="Search restaurants" className="pl-9" />
            </div>
            <Select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} aria-label="Filter listing state">
              <option value="all">All listings</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
            <Select value={cuisine} onChange={(event) => setCuisine(event.target.value)} aria-label="Filter cuisine">
              <option value="all">All cuisines</option>
              {cuisines.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            {hasFilters ? <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setActiveFilter('all'); setCuisine('all'); }}>Clear</Button> : null}
          </div>
        </CardBody>
      </Card>

      {filtered.length ? (
        <TableShell label="Restaurant table">
          <THead>
            <tr>
              <TH>Restaurant</TH>
              <TH>Owner</TH>
              <TH>Cuisine</TH>
              <TH>Hours</TH>
              <TH>Menu</TH>
              <TH>Orders</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {filtered.map((restaurant) => {
              const menu = menuByRestaurant.get(restaurant.id) ?? { total: 0, available: 0 };
              const orders = ordersByRestaurant.get(restaurant.id) ?? { total: 0, active: 0 };
              return (
                <TR key={restaurant.id} onClick={() => openDetails(restaurant)}>
                  <TD>
                    <p className="font-semibold text-ink">{restaurant.name}</p>
                    <p className="max-w-[220px] truncate text-xs text-muted">{restaurant.address_line}, {restaurant.city}</p>
                  </TD>
                  <TD className="text-xs">{ownerById.get(restaurant.owner_id)?.full_name || 'Owner profile'}</TD>
                  <TD>{restaurant.cuisine_type || '—'}</TD>
                  <TD className="whitespace-nowrap text-xs">{formatTime(restaurant.opening_time)} – {formatTime(restaurant.closing_time)}</TD>
                  <TD className="text-xs">{menu.available}/{menu.total} available</TD>
                  <TD className="text-xs">{orders.active} active / {orders.total}</TD>
                  <TD>
                    <Badge variant={restaurant.is_active ? 'green' : 'neutral'} dot>{restaurant.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </TableShell>
      ) : (
        <EmptyState
          icon={Store}
          title={hasFilters ? 'No restaurants match these filters' : 'No restaurants available'}
          description={hasFilters ? 'Adjust the filters to review the full network.' : 'Restaurants appear after trusted provisioning creates an owner and listing.'}
          action={hasFilters ? <Button variant="secondary" onClick={() => { setSearch(''); setActiveFilter('all'); setCuisine('all'); }}>Clear filters</Button> : null}
        />
      )}

      <InlineNotice tone="neutral" title="Visibility boundary">
        Deactivating a restaurant hides it from the public catalogue. It does not delete orders,
        menu records or the owner account, and the change is still subject to RLS.
      </InlineNotice>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.name || 'Restaurant'}
        description={selected ? `${selected.cuisine_type || 'Cuisine'} · ${selected.city}` : ''}
        footer={
          selected ? (
            confirmToggle ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-800">
                  {selected.is_active ? 'Hide this restaurant from the public catalogue?' : 'Make this restaurant visible to customers again?'}
                </p>
                <div className="flex gap-2">
                  <Button variant={selected.is_active ? 'danger' : 'primary'} size="sm" loading={saving} onClick={handleToggle}>
                    {selected.is_active ? 'Confirm deactivate' : 'Confirm activate'}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setConfirmToggle(false)} disabled={saving}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant={selected.is_active ? 'danger' : 'primary'} size="sm" onClick={() => setConfirmToggle(true)}>
                  {selected.is_active ? 'Deactivate listing' : 'Activate listing'}
                </Button>
                <Badge variant={selected.is_active ? 'green' : 'neutral'} dot>{selected.is_active ? 'Active' : 'Inactive'}</Badge>
              </div>
            )
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4">
            {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
            {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

            <dl className="grid gap-4 rounded-lg border border-line bg-slate-50 p-4 sm:grid-cols-2">
              <DefinitionItem label="Owner">{ownerById.get(selected.owner_id)?.full_name || '—'}</DefinitionItem>
              <DefinitionItem label="Owner email">{ownerById.get(selected.owner_id)?.email || '—'}</DefinitionItem>
              <DefinitionItem label="Phone">{selected.phone || '—'}</DefinitionItem>
              <DefinitionItem label="Public slug"><span className="font-mono text-xs">{selected.slug}</span></DefinitionItem>
              <DefinitionItem label="Address">{selected.address_line}{selected.landmark ? `, ${selected.landmark}` : ''}</DefinitionItem>
              <DefinitionItem label="City">{selected.city}, {selected.state} {selected.pincode || ''}</DefinitionItem>
              <DefinitionItem label="Hours">{formatTime(selected.opening_time)} – {formatTime(selected.closing_time)}</DefinitionItem>
              <DefinitionItem label="Preparation estimate">{selected.default_prep_time_minutes} min</DefinitionItem>
              <DefinitionItem label="Rating">{Number(selected.rating).toFixed(1)}</DefinitionItem>
              <DefinitionItem label="Menu">{menuByRestaurant.get(selected.id)?.available ?? 0} available of {menuByRestaurant.get(selected.id)?.total ?? 0}</DefinitionItem>
            </dl>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Description</p>
              <p className="mt-1.5 text-sm leading-6 text-slate-700">{selected.description || 'No description recorded.'}</p>
            </div>

            <InlineNotice tone="info" title="Owner-controlled fields">
              Restaurant owners manage their own presentation, hours, menu and preparation settings.
              This admin view can change catalogue visibility only.
            </InlineNotice>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

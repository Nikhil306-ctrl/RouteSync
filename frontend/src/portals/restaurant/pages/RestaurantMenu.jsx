import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CircleOff,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { Card, CardBody, StatCard } from '../../../components/ui/Card.jsx';
import Badge from '../../../components/ui/Badge.jsx';
import { EmptyState, ErrorState, InlineNotice, LoadingState } from '../../../components/ui/States.jsx';
import { Input, LabeledInput, LabeledSelect, LabeledTextarea } from '../../../components/ui/Field.jsx';
import Tabs from '../../../components/ui/Tabs.jsx';
import { TableShell, TBody, TD, TH, THead, TR } from '../../../components/ui/Table.jsx';
import Button from '../../../components/ui/Button.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import FoodImage from '../../../components/FoodImage.jsx';
import { useAsyncData, useDocumentTitle } from '../../../hooks/useAsyncData.js';
import { useAuth } from '../../../auth/AuthContext.jsx';
import { formatCurrency } from '../../../lib/format.js';
import { menuItemImage } from '../../../lib/images.js';
import {
  createMenuCategory,
  createMenuItem,
  deleteMenuCategory,
  deleteMenuItem,
  getOwnerRestaurant,
  listRestaurantMenu,
  updateMenuCategory,
  updateMenuItem,
} from '../../../services/restaurants.js';

function ItemEditor({ item, categories, onSave, onDelete, saving, error }) {
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [categoryId, setCategoryId] = useState(item?.category_id ?? categories[0]?.id ?? '');
  const [price, setPrice] = useState(item ? (item.price_minor / 100).toFixed(0) : '');
  const [prepTime, setPrepTime] = useState(item?.prep_time_minutes ?? 15);
  const [vegetarian, setVegetarian] = useState(item?.is_vegetarian ?? true);
  const [available, setAvailable] = useState(item?.is_available ?? true);
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validation, setValidation] = useState('');

  const submit = (event) => {
    event.preventDefault();
    setValidation('');
    if (!name.trim()) {
      setValidation('Enter an item name.');
      return;
    }
    if (price === '' || Number(price) < 0) {
      setValidation('Enter a valid price in rupees.');
      return;
    }
    if (Number(prepTime) < 1 || Number(prepTime) > 240) {
      setValidation('Preparation time must be between 1 and 240 minutes.');
      return;
    }
    onSave({
      name,
      description,
      category_id: categoryId,
      price_rupees: Number(price),
      prep_time_minutes: Number(prepTime),
      is_vegetarian: vegetarian,
      is_available: available,
      image_url: imageUrl,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" id="menu-item-form">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {validation ? <InlineNotice tone="danger">{validation}</InlineNotice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput label="Item name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Paneer Tikka" />
        <LabeledSelect label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">No category</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </LabeledSelect>
      </div>
      <LabeledTextarea
        label="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="A short description shown to customers."
        rows={3}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <LabeledInput label="Price (₹)" type="number" min="0" step="1" required value={price} onChange={(event) => setPrice(event.target.value)} />
        <LabeledInput label="Prep time (minutes)" type="number" min="1" max="240" required value={prepTime} onChange={(event) => setPrepTime(event.target.value)} />
        <LabeledSelect label="Diet" value={vegetarian ? 'veg' : 'nonveg'} onChange={(event) => setVegetarian(event.target.value === 'veg')}>
          <option value="veg">Vegetarian</option>
          <option value="nonveg">Non-vegetarian</option>
        </LabeledSelect>
      </div>
      <LabeledInput
        label="Image URL (optional)"
        type="url"
        value={imageUrl}
        onChange={(event) => setImageUrl(event.target.value)}
        placeholder="https://…"
        hint="Storage uploads are not part of this phase; a fallback image is used if this is blank or unavailable."
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
          <input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
          <span>
            <span className="block text-sm font-semibold text-ink">Available to order</span>
            <span className="block text-xs text-muted">Unavailable items stay on the menu but are hidden publicly.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
          <input type="checkbox" checked={vegetarian} onChange={(event) => setVegetarian(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
          <span>
            <span className="block text-sm font-semibold text-ink">Vegetarian</span>
            <span className="block text-xs text-muted">Displayed as a dietary marker.</span>
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
        <div>
          {item ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(item)}>Confirm delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete item</Button>
            )
          ) : null}
        </div>
        <Button type="submit" loading={saving} icon={item ? Pencil : Plus}>
          {saving ? 'Saving…' : item ? 'Save item' : 'Add item'}
        </Button>
      </div>
    </form>
  );
}

function CategoryEditor({ category, onSave, onDelete, saving, error }) {
  const [name, setName] = useState(category?.name ?? '');
  const [displayOrder, setDisplayOrder] = useState(category?.display_order ?? 0);
  const [active, setActive] = useState(category?.is_active ?? true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [validation, setValidation] = useState('');

  const submit = (event) => {
    event.preventDefault();
    setValidation('');
    if (!name.trim()) {
      setValidation('Enter a category name.');
      return;
    }
    onSave({ name, display_order: Number(displayOrder) || 0, is_active: active });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error ? <InlineNotice tone="danger">{error}</InlineNotice> : null}
      {validation ? <InlineNotice tone="danger">{validation}</InlineNotice> : null}
      <LabeledInput label="Category name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Starters" />
      <LabeledInput label="Display order" type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} hint="Lower numbers appear first for customers." />
      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-600" />
        <span>
          <span className="block text-sm font-semibold text-ink">Category active</span>
          <span className="block text-xs text-muted">Inactive categories are hidden from the public menu.</span>
        </span>
      </label>
      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
        <div>
          {category ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="danger" size="sm" icon={Trash2} onClick={() => onDelete(category)}>Confirm delete</Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button type="button" variant="ghost" size="sm" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete category</Button>
            )
          ) : null}
        </div>
        <Button type="submit" loading={saving} icon={category ? Pencil : Plus}>
          {saving ? 'Saving…' : category ? 'Save category' : 'Add category'}
        </Button>
      </div>
    </form>
  );
}

export default function RestaurantMenu() {
  useDocumentTitle('Menu & availability');
  const { user } = useAuth();
  const [tab, setTab] = useState('items');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [itemModal, setItemModal] = useState({ open: false, item: null });
  const [categoryModal, setCategoryModal] = useState({ open: false, category: null });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const { data, loading, error, reload, setData } = useAsyncData(async () => {
    const restaurant = await getOwnerRestaurant(user.id);
    if (!restaurant) return { restaurant: null, categories: [], items: [] };
    const menu = await listRestaurantMenu(restaurant.id);
    return { restaurant, ...menu };
  }, [user.id]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (data?.items ?? []).filter((item) => {
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) return false;
      if (availabilityFilter === 'available' && !item.is_available) return false;
      if (availabilityFilter === 'unavailable' && item.is_available) return false;
      if (!query) return true;
      return [item.name, item.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data, search, categoryFilter, availabilityFilter]);

  const itemCounts = useMemo(() => {
    const map = new Map();
    for (const item of data?.items ?? []) map.set(item.category_id, (map.get(item.category_id) ?? 0) + 1);
    return map;
  }, [data]);

  const openItem = (item = null) => {
    setItemModal({ open: true, item });
    setModalError('');
  };
  const openCategory = (category = null) => {
    setCategoryModal({ open: true, category });
    setModalError('');
  };

  const handleSaveItem = async (values) => {
    setSaving(true);
    setModalError('');
    try {
      const saved = itemModal.item
        ? await updateMenuItem(itemModal.item.id, values)
        : await createMenuItem(data.restaurant.id, values);
      setData((current) => ({
        ...current,
        items: itemModal.item
          ? current.items.map((item) => (item.id === saved.id ? saved : item))
          : [...current.items, saved],
      }));
      setItemModal({ open: false, item: null });
      setActionMessage(itemModal.item ? 'Menu item updated.' : 'Menu item added.');
    } catch (saveError) {
      setModalError(saveError.message ?? 'Unable to save this menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    setSaving(true);
    setModalError('');
    try {
      await deleteMenuItem(item.id);
      setData((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id) }));
      setItemModal({ open: false, item: null });
      setActionMessage('Menu item deleted.');
    } catch (deleteError) {
      setModalError(deleteError.message ?? 'Unable to delete this menu item.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCategory = async (values) => {
    setSaving(true);
    setModalError('');
    try {
      const saved = categoryModal.category
        ? await updateMenuCategory(categoryModal.category.id, values)
        : await createMenuCategory(data.restaurant.id, values);
      setData((current) => ({
        ...current,
        categories: categoryModal.category
          ? current.categories.map((category) => (category.id === saved.id ? saved : category))
          : [...current.categories, saved].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)),
      }));
      setCategoryModal({ open: false, category: null });
      setActionMessage(categoryModal.category ? 'Menu category updated.' : 'Menu category added.');
    } catch (saveError) {
      setModalError(saveError.message ?? 'Unable to save this category.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (category) => {
    setSaving(true);
    setModalError('');
    try {
      await deleteMenuCategory(category.id);
      setData((current) => ({
        ...current,
        categories: current.categories.filter((entry) => entry.id !== category.id),
        items: current.items.map((item) => (item.category_id === category.id ? { ...item, category_id: null } : item)),
      }));
      setCategoryModal({ open: false, category: null });
      setActionMessage('Category deleted. Existing items are now uncategorised.');
    } catch (deleteError) {
      setModalError(deleteError.message ?? 'Unable to delete this category.');
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (item) => {
    setActionError('');
    setActionMessage('');
    try {
      const updated = await updateMenuItem(item.id, { is_available: !item.is_available });
      setData((current) => ({ ...current, items: current.items.map((entry) => (entry.id === updated.id ? updated : entry)) }));
      setActionMessage(`${updated.name} is now ${updated.is_available ? 'available' : 'unavailable'}.`);
    } catch (toggleError) {
      setActionError(toggleError.message ?? 'Unable to update item availability.');
    }
  };

  if (loading) return <LoadingState rows={5} label="Loading menu" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.restaurant) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Menu operations" title="Menu & availability" />
        <EmptyState icon={Store} title="Restaurant profile unavailable" description="A restaurant must be linked to this account before the menu can be managed." />
      </div>
    );
  }

  const available = data.items.filter((item) => item.is_available).length;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue operations"
        title="Menu & availability"
        description="Manage categories, item availability, pricing and preparation times. Changes use the restaurant owner's RLS-scoped writes."
        actions={
          <>
            <Button variant="secondary" icon={Plus} onClick={() => openCategory()}>Add category</Button>
            <Button icon={Plus} onClick={() => openItem()}>Add item</Button>
          </>
        }
      />

      {actionError ? <InlineNotice tone="danger">{actionError}</InlineNotice> : null}
      {actionMessage ? <InlineNotice tone="success">{actionMessage}</InlineNotice> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Menu items" value={data.items.length} helper={`${available} currently available`} icon={UtensilsCrossed} tone="orange" />
        <StatCard label="Categories" value={data.categories.length} helper={`${data.categories.filter((category) => category.is_active).length} active`} icon={CheckCircle2} />
        <StatCard label="Unavailable" value={data.items.length - available} helper="Hidden from the public menu" icon={CircleOff} />
      </div>

      <Card>
        <Tabs
          tabs={[
            { value: 'items', label: 'Items', count: data.items.length },
            { value: 'categories', label: 'Categories', count: data.categories.length },
          ]}
          value={tab}
          onChange={setTab}
          className="px-4 pt-1"
          ariaLabel="Menu management tabs"
        />
        {tab === 'items' ? (
          <>
            <CardBody className="border-b border-line">
              <div className="grid gap-2.5 lg:grid-cols-[1fr_180px_170px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search menu items…" aria-label="Search menu items" className="pl-9" />
                </div>
                <LabeledSelect label="" aria-label="Filter category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                  <option value="all">All categories</option>
                  {data.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </LabeledSelect>
                <LabeledSelect label="" aria-label="Filter availability" value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
                  <option value="all">All availability</option>
                  <option value="available">Available</option>
                  <option value="unavailable">Unavailable</option>
                </LabeledSelect>
                {(search || categoryFilter !== 'all' || availabilityFilter !== 'all') ? (
                  <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(''); setCategoryFilter('all'); setAvailabilityFilter('all'); }}>Clear</Button>
                ) : null}
              </div>
            </CardBody>

            {filteredItems.length ? (
              <TableShell className="rounded-none border-x-0 border-b-0">
                <THead>
                  <tr>
                    <TH>Item</TH>
                    <TH>Category</TH>
                    <TH>Price</TH>
                    <TH>Prep</TH>
                    <TH>Diet</TH>
                    <TH>Availability</TH>
                    <TH>Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {filteredItems.map((item) => {
                    const category = data.categories.find((entry) => entry.id === item.category_id);
                    const image = menuItemImage(item);
                    return (
                      <TR key={item.id}>
                        <TD>
                          <div className="flex items-center gap-3">
                            <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              <FoodImage src={image.src} alt={image.alt} />
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-ink">{item.name}</p>
                              <p className="max-w-[260px] truncate text-xs text-muted">{item.description || 'No description'}</p>
                            </div>
                          </div>
                        </TD>
                        <TD>{category?.name || 'Uncategorised'}</TD>
                        <TD className="font-semibold tabular-nums">{formatCurrency(item.price_minor, item.currency)}</TD>
                        <TD className="text-xs">{item.prep_time_minutes} min</TD>
                        <TD>
                          <Badge variant={item.is_vegetarian ? 'green' : 'red'} dot={false}>{item.is_vegetarian ? 'Veg' : 'Non-veg'}</Badge>
                        </TD>
                        <TD>
                          <button
                            type="button"
                            onClick={() => toggleAvailability(item)}
                            aria-pressed={item.is_available}
                            className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold ${item.is_available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${item.is_available ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                            {item.is_available ? 'Available' : 'Unavailable'}
                          </button>
                        </TD>
                        <TD>
                          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => openItem(item)}>Edit</Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </TableShell>
            ) : (
              <div className="p-5">
                <EmptyState
                  icon={UtensilsCrossed}
                  title={data.items.length ? 'No items match these filters' : 'No menu items yet'}
                  description={data.items.length ? 'Clear the filters or add a new item.' : 'Add your first menu item so customers can build an order.'}
                  action={<Button icon={Plus} onClick={() => openItem()}>Add item</Button>}
                />
              </div>
            )}
          </>
        ) : (
          <div className="p-4 sm:p-5">
            {data.categories.length ? (
              <div className="space-y-2">
                {data.categories.map((category) => (
                  <div key={category.id} className="flex flex-col gap-3 rounded-lg border border-line p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{category.name}</p>
                        <Badge variant={category.is_active ? 'green' : 'neutral'} dot>{category.is_active ? 'Active' : 'Inactive'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">Display order {category.display_order} · {itemCounts.get(category.id) ?? 0} items</p>
                    </div>
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => openCategory(category)}>Edit</Button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={UtensilsCrossed}
                title="No categories yet"
                description="Categories organise the menu for customers. Add one before grouping items."
                action={<Button icon={Plus} onClick={() => openCategory()}>Add category</Button>}
              />
            )}
          </div>
        )}
      </Card>

      <InlineNotice tone="neutral" title="Public menu visibility">
        Unavailable items and inactive categories are hidden from customers by RLS. They remain
        visible here so restaurant staff can restore them without losing data.
      </InlineNotice>

      <Modal
        open={itemModal.open}
        onClose={() => setItemModal({ open: false, item: null })}
        title={itemModal.item ? 'Edit menu item' : 'Add menu item'}
        description={itemModal.item ? itemModal.item.name : 'Create a new item for this restaurant.'}
        size="lg"
      >
        {itemModal.open ? (
          <ItemEditor
            key={itemModal.item?.id ?? 'new'}
            item={itemModal.item}
            categories={data.categories}
            onSave={handleSaveItem}
            onDelete={handleDeleteItem}
            saving={saving}
            error={modalError}
          />
        ) : null}
      </Modal>

      <Modal
        open={categoryModal.open}
        onClose={() => setCategoryModal({ open: false, category: null })}
        title={categoryModal.category ? 'Edit category' : 'Add category'}
        description="Categories control the order of the customer menu."
      >
        {categoryModal.open ? (
          <CategoryEditor
            key={categoryModal.category?.id ?? 'new-category'}
            category={categoryModal.category}
            onSave={handleSaveCategory}
            onDelete={handleDeleteCategory}
            saving={saving}
            error={modalError}
          />
        ) : null}
      </Modal>
    </div>
  );
}

import { requireSupabase, unwrap } from './client.js';

const RESTAURANT_FIELDS = `
  id, owner_id, name, slug, description, cuisine_type, phone, email,
  address_line, landmark, city, state, pincode, latitude, longitude,
  default_prep_time_minutes, opening_time, closing_time, is_active, rating,
  created_at, updated_at
`;

export async function listPublicRestaurants() {
  const supabase = requireSupabase();
  const data = unwrap(
    await supabase
      .from('restaurants')
      .select(RESTAURANT_FIELDS)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  );
  return data ?? [];
}

export async function listAdminRestaurants() {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('restaurants')
        .select(RESTAURANT_FIELDS)
        .order('created_at', { ascending: true }),
    ) ?? []
  );
}

export async function listMenuOverviewForAdmin() {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('menu_items')
        .select('id, restaurant_id, name, is_available')
        .order('name', { ascending: true }),
    ) ?? []
  );
}

export async function listPublicMenuSummary() {
  const supabase = requireSupabase();
  return (
    unwrap(
      await supabase
        .from('menu_items')
        .select('id, restaurant_id, category_id, name, description, price_minor, currency, is_vegetarian, prep_time_minutes')
        .order('name', { ascending: true }),
    ) ?? []
  );
}

export async function getRestaurantBySlug(slug) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase.from('restaurants').select(RESTAURANT_FIELDS).eq('slug', slug).maybeSingle(),
  );
}

export async function getOwnerRestaurant(ownerId) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('restaurants')
      .select(RESTAURANT_FIELDS)
      .eq('owner_id', ownerId)
      .maybeSingle(),
  );
}

export async function getRestaurantById(id) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase.from('restaurants').select(RESTAURANT_FIELDS).eq('id', id).maybeSingle(),
  );
}

export async function listRestaurantMenu(restaurantId) {
  const supabase = requireSupabase();
  const [categories, items] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id, restaurant_id, name, display_order, is_active, created_at, updated_at')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
      .then(unwrap),
    supabase
      .from('menu_items')
      .select(
        'id, restaurant_id, category_id, name, description, price_minor, currency, is_vegetarian, is_available, prep_time_minutes, image_url, created_at, updated_at',
      )
      .eq('restaurant_id', restaurantId)
      .order('name', { ascending: true })
      .then(unwrap),
  ]);

  return {
    categories: categories ?? [],
    items: items ?? [],
  };
}

export async function updateRestaurant(id, updates) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('restaurants')
      .update(updates)
      .eq('id', id)
      .select(RESTAURANT_FIELDS)
      .single(),
  );
}

export async function createMenuCategory(restaurantId, values) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('menu_categories')
      .insert({
        restaurant_id: restaurantId,
        name: values.name.trim(),
        display_order: Number(values.display_order) || 0,
        is_active: values.is_active ?? true,
      })
      .select()
      .single(),
  );
}

export async function updateMenuCategory(id, values) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('menu_categories')
      .update({
        name: values.name?.trim(),
        display_order: values.display_order === undefined ? undefined : Number(values.display_order),
        is_active: values.is_active,
      })
      .eq('id', id)
      .select()
      .single(),
  );
}

export async function deleteMenuCategory(id) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('menu_categories').delete().eq('id', id);
  if (error) throw error;
  return true;
}

export async function createMenuItem(restaurantId, values) {
  const supabase = requireSupabase();
  return unwrap(
    await supabase
      .from('menu_items')
      .insert({
        restaurant_id: restaurantId,
        category_id: values.category_id || null,
        name: values.name.trim(),
        description: values.description?.trim() || null,
        price_minor: Math.round(Number(values.price_rupees) * 100),
        currency: 'INR',
        is_vegetarian: values.is_vegetarian ?? true,
        is_available: values.is_available ?? true,
        prep_time_minutes: Number(values.prep_time_minutes) || 15,
        image_url: values.image_url?.trim() || null,
      })
      .select()
      .single(),
  );
}

export async function updateMenuItem(id, values) {
  const supabase = requireSupabase();
  const patch = {};
  if (values.name !== undefined) patch.name = values.name.trim();
  if (values.description !== undefined) patch.description = values.description.trim() || null;
  if (values.category_id !== undefined) patch.category_id = values.category_id || null;
  if (values.price_rupees !== undefined) patch.price_minor = Math.round(Number(values.price_rupees) * 100);
  if (values.is_vegetarian !== undefined) patch.is_vegetarian = Boolean(values.is_vegetarian);
  if (values.is_available !== undefined) patch.is_available = Boolean(values.is_available);
  if (values.prep_time_minutes !== undefined) patch.prep_time_minutes = Number(values.prep_time_minutes);
  if (values.image_url !== undefined) patch.image_url = values.image_url.trim() || null;

  return unwrap(
    await supabase.from('menu_items').update(patch).eq('id', id).select().single(),
  );
}

export async function deleteMenuItem(id) {
  const supabase = requireSupabase();
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * RouteSync development-only demo seeder.
 *
 * NOT run automatically. Requires applied migrations and explicit approval.
 * Uses the server-side secret key and DEMO_* password environment variables.
 * Never run this with production credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, '..');

function loadDevVars() {
  const file = path.join(backendRoot, '.dev.vars');
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadDevVars();

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

const passwords = {
  admin: process.env.DEMO_ADMIN_PASSWORD,
  restaurant: process.env.DEMO_RESTAURANT_PASSWORD,
  rider: process.env.DEMO_RIDER_PASSWORD,
  customer: process.env.DEMO_CUSTOMER_PASSWORD,
};

if (!url || !secretKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in backend/.dev.vars.');
  process.exit(1);
}
if (Object.values(passwords).some((value) => !value || value.length < 8)) {
  console.error('Set DEMO_ADMIN_PASSWORD, DEMO_RESTAURANT_PASSWORD, DEMO_RIDER_PASSWORD and DEMO_CUSTOMER_PASSWORD (8+ characters) before seeding.');
  process.exit(1);
}

const admin = createClient(url, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const now = new Date();
const plusMinutes = (minutes) => new Date(now.getTime() + minutes * 60_000).toISOString();

const users = [
  { key: 'admin', email: 'admin.demo@example.com', fullName: 'Demo Dispatcher', role: 'admin', password: passwords.admin },
  { key: 'owner1', email: 'owner1.demo@example.com', fullName: 'Aarav Patil', role: 'restaurant', password: passwords.restaurant },
  { key: 'owner2', email: 'owner2.demo@example.com', fullName: 'Meera Kulkarni', role: 'restaurant', password: passwords.restaurant },
  { key: 'owner3', email: 'owner3.demo@example.com', fullName: 'Rohan Desai', role: 'restaurant', password: passwords.restaurant },
  { key: 'rider1', email: 'rider1.demo@example.com', fullName: 'Sagar Naik', role: 'rider', password: passwords.rider },
  { key: 'rider2', email: 'rider2.demo@example.com', fullName: 'Pooja Kamble', role: 'rider', password: passwords.rider },
  { key: 'rider3', email: 'rider3.demo@example.com', fullName: 'Imran Shaikh', role: 'rider', password: passwords.rider },
  { key: 'rider4', email: 'rider4.demo@example.com', fullName: 'Vikram Jadhav', role: 'rider', password: passwords.rider },
  { key: 'rider5', email: 'rider5.demo@example.com', fullName: 'Ananya Rao', role: 'rider', password: passwords.rider },
  { key: 'customer1', email: 'customer1.demo@example.com', fullName: 'Neha Joshi', role: 'customer', password: passwords.customer },
  { key: 'customer2', email: 'customer2.demo@example.com', fullName: 'Kiran Shetty', role: 'customer', password: passwords.customer },
  { key: 'customer3', email: 'customer3.demo@example.com', fullName: 'Aditya Nair', role: 'customer', password: passwords.customer },
];

const restaurants = [
  {
    id: '55555555-5555-4555-8555-555555555551', ownerKey: 'owner1', name: 'Belagavi Spice House',
    slug: 'belagavi-spice-house', description: 'Fictional North Karnataka kitchen serving fresh thalis and biryanis.',
    cuisine_type: 'North Karnataka', phone: '+91-00000-00001', email: 'spicehouse.demo@example.com',
    address_line: '12, Tilakwadi Main Road', landmark: 'Near Tilakwadi Garden', city: 'Belagavi',
    state: 'Karnataka', pincode: '590006', latitude: 15.8428, longitude: 74.5012,
    default_prep_time_minutes: 25, opening_time: '09:00', closing_time: '22:00', rating: 4.5,
  },
  {
    id: '55555555-5555-4555-8555-555555555552', ownerKey: 'owner2', name: 'North Karnataka Kitchen',
    slug: 'north-karnataka-kitchen', description: 'Fictional homestyle ragi mudde, jolada rotti and curry kitchen.',
    cuisine_type: 'Regional', phone: '+91-00000-00002', email: 'northkitchen.demo@example.com',
    address_line: '48, Nehru Nagar', landmark: 'Opposite Nehru Nagar Bus Stop', city: 'Belagavi',
    state: 'Karnataka', pincode: '590010', latitude: 15.8561, longitude: 74.5075,
    default_prep_time_minutes: 20, opening_time: '08:30', closing_time: '21:30', rating: 4.3,
  },
  {
    id: '55555555-5555-4555-8555-555555555553', ownerKey: 'owner3', name: 'Chennamma Cafe',
    slug: 'chennamma-cafe', description: 'Fictional cafe for sandwiches, filter coffee and quick snacks.',
    cuisine_type: 'Cafe', phone: '+91-00000-00003', email: 'cafe.demo@example.com',
    address_line: '7, Udyambag Industrial Road', landmark: 'Near Udyambag Circle', city: 'Belagavi',
    state: 'Karnataka', pincode: '590008', latitude: 15.8274, longitude: 74.4896,
    default_prep_time_minutes: 12, opening_time: '10:00', closing_time: '23:00', rating: 4.6,
  },
];

const categories = [
  { id: '66666666-6666-4666-8666-666666666601', restaurantIndex: 0, name: 'Starters', display_order: 1 },
  { id: '66666666-6666-4666-8666-666666666602', restaurantIndex: 0, name: 'Main Course', display_order: 2 },
  { id: '66666666-6666-4666-8666-666666666603', restaurantIndex: 1, name: 'North Karnataka Specials', display_order: 1 },
  { id: '66666666-6666-4666-8666-666666666604', restaurantIndex: 1, name: 'Breads & Rice', display_order: 2 },
  { id: '66666666-6666-4666-8666-666666666605', restaurantIndex: 2, name: 'Cafe & Snacks', display_order: 1 },
  { id: '66666666-6666-4666-8666-666666666606', restaurantIndex: 2, name: 'Beverages', display_order: 2 },
];

const menuItems = [
  [0, 0, 'Paneer Tikka', 'Char-grilled paneer with peppers.', 22000, true, 15, 701],
  [0, 0, 'Chicken Kabab', 'Spiced chicken kabab with mint chutney.', 26000, false, 18, 702],
  [0, 1, 'Belagavi Thali', 'Seasonal vegetables, dal, rice, chapati and sweet.', 32000, true, 25, 703],
  [0, 1, 'Jowar Roti Meal', 'Jowar roti, curry, rice and salad.', 24000, true, 20, 704],
  [0, 1, 'Veg Biryani', 'Fragrant rice with vegetables and raita.', 28000, true, 25, 705],
  [0, 1, 'Chicken Biryani', 'Slow-cooked chicken biryani with raita.', 32000, false, 30, 706],
  [0, 1, 'Dal Tadka', 'Yellow dal with a garlic tempering.', 18000, true, 15, 707],
  [0, 1, 'Gulab Jamun', 'Two warm milk dumplings.', 9000, true, 5, 708],
  [1, 2, 'Ragi Mudde Meal', 'Ragi mudde with chicken or vegetable curry.', 22000, false, 20, 709],
  [1, 2, 'North Karnataka Thali', 'Jolada rotti, enne badanekai, rice and curd.', 30000, true, 25, 710],
  [1, 2, 'Chicken Curry', 'Home-style spicy chicken curry.', 26000, false, 25, 711],
  [1, 2, 'Holige', 'Sweet flatbread with jaggery and dal.', 10000, true, 10, 712],
  [1, 3, 'Jolada Rotti', 'Two sorghum flatbreads.', 12000, true, 12, 713],
  [1, 3, 'Chapati (2 pcs)', 'Soft whole-wheat chapati.', 8000, true, 8, 714],
  [1, 3, 'Rice', 'Steamed rice portion.', 7000, true, 8, 715],
  [1, 3, 'Sambar', 'Lentil and vegetable sambar.', 9000, true, 10, 716],
  [2, 4, 'Veg Sandwich', 'Grilled vegetable sandwich with chutney.', 12000, true, 10, 717],
  [2, 4, 'Chicken Sandwich', 'Grilled chicken and cheese sandwich.', 16000, false, 12, 718],
  [2, 4, 'French Fries', 'Crisp potato fries.', 10000, true, 8, 719],
  [2, 4, 'Veg Burger', 'Vegetable patty burger with slaw.', 14000, true, 12, 720],
  [2, 4, 'Chocolate Brownie', 'Warm chocolate brownie.', 12000, true, 5, 721],
  [2, 5, 'Filter Coffee', 'South Indian filter coffee.', 5000, true, 5, 722],
  [2, 5, 'Masala Chai', 'Spiced tea.', 4000, true, 4, 723],
  [2, 5, 'Fresh Lime Soda', 'Sweet or salted lime soda.', 6000, true, 3, 724],
];

const menuRows = menuItems.map(([restaurantIndex, categoryIndex, name, description, priceMinor, vegetarian, prep, suffix]) => ({
  id: `77777777-7777-4777-8777-777777777${String(suffix).padStart(3, '0')}`,
  restaurant_id: restaurants[restaurantIndex].id,
  category_id: categories[categoryIndex].id,
  name,
  description,
  price_minor: priceMinor,
  currency: 'INR',
  is_vegetarian: vegetarian,
  is_available: true,
  prep_time_minutes: prep,
}));

const riders = [
  { key: 'rider1', vehicle_type: 'bike', vehicle_number: 'KA-22-DEMO-01', max_concurrent_orders: 2, lat: 15.844, lon: 74.498 },
  { key: 'rider2', vehicle_type: 'scooter', vehicle_number: 'KA-22-DEMO-02', max_concurrent_orders: 2, lat: 15.852, lon: 74.504 },
  { key: 'rider3', vehicle_type: 'bike', vehicle_number: 'KA-22-DEMO-03', max_concurrent_orders: 3, lat: 15.831, lon: 74.493 },
  { key: 'rider4', vehicle_type: 'bike', vehicle_number: 'KA-22-DEMO-04', max_concurrent_orders: 2, lat: 15.861, lon: 74.512 },
  { key: 'rider5', vehicle_type: 'scooter', vehicle_number: 'KA-22-DEMO-05', max_concurrent_orders: 1, lat: 15.838, lon: 74.486 },
];

const addresses = [
  {
    id: '88888888-8888-4888-8888-888888888801', customerKey: 'customer1', label: 'Home',
    recipient_name: 'Neha Joshi', phone: '+91-00000-10001', address_line1: '14, Tilakwadi 2nd Cross',
    landmark: 'Near Tilakwadi Park', pincode: '590006', latitude: 15.8432, longitude: 74.5001, is_default: true,
  },
  {
    id: '88888888-8888-4888-8888-888888888802', customerKey: 'customer2', label: 'Hostel',
    recipient_name: 'Kiran Shetty', phone: '+91-00000-10002', address_line1: 'Room 12, Nehru Nagar Hostel',
    landmark: 'Nehru Nagar', pincode: '590010', latitude: 15.8552, longitude: 74.5061, is_default: true,
  },
  {
    id: '88888888-8888-4888-8888-888888888803', customerKey: 'customer3', label: 'Work',
    recipient_name: 'Aditya Nair', phone: '+91-00000-10003', address_line1: 'Plot 5, Udyambag Industrial Area',
    landmark: 'Udyambag Circle', pincode: '590008', latitude: 15.8281, longitude: 74.4902, is_default: true,
  },
];

const orders = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', customerKey: 'customer1', restaurantIndex: 0,
    addressIndex: 0, status: 'pending', priority: 'high', subtotal: 54000, fee: 3000, discount: 0,
    prep: 25, start: plusMinutes(45), end: plusMinutes(90), lines: [[0, 1], [2, 1]],
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', customerKey: 'customer2', restaurantIndex: 1,
    addressIndex: 1, status: 'confirmed', priority: 'normal', subtotal: 48000, fee: 2500, discount: 0,
    prep: 25, start: plusMinutes(50), end: plusMinutes(100), lines: [[8, 1], [10, 1]],
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', customerKey: 'customer3', restaurantIndex: 2,
    addressIndex: 2, status: 'assigned', priority: 'urgent', subtotal: 17000, fee: 2000, discount: 0,
    prep: 12, start: plusMinutes(30), end: plusMinutes(60), lines: [[21, 1], [16, 1]],
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', customerKey: 'customer1', restaurantIndex: 0,
    addressIndex: 0, status: 'delivered', priority: 'normal', subtotal: 41000, fee: 3000, discount: 2000,
    prep: 30, start: plusMinutes(-60), end: plusMinutes(-10), lines: [[5, 1], [7, 1]],
  },
];

const orderItemRows = [];
let orderItemSuffix = 1;
for (const order of orders) {
  for (const [menuIndex, quantity] of order.lines) {
    const item = menuRows[menuIndex];
    orderItemRows.push({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb${String(orderItemSuffix++).padStart(2, '0')}`,
      order_id: order.id,
      menu_item_id: item.id,
      item_name: item.name,
      unit_price_minor: item.price_minor,
      quantity,
    });
  }
}

async function listAllUsers() {
  const all = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return all;
}

async function ensureAuthUser(user, existingUsers) {
  const existing = existingUsers.find((candidate) => candidate.email?.toLowerCase() === user.email);
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: user.password,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { full_name: user.fullName },
  });
  if (error) throw error;
  return data.user.id;
}

async function upsert(table, rows, onConflict = 'id') {
  if (!rows.length) return;
  const { error } = await admin.from(table).upsert(rows, { onConflict });
  if (error) throw error;
}

async function main() {
  const existingUsers = await listAllUsers();
  const userIds = {};

  for (const user of users) {
    userIds[user.key] = await ensureAuthUser(user, existingUsers);
  }

  await upsert('profiles', users.map((user) => ({
    id: userIds[user.key],
    role: user.role,
    email: user.email,
    full_name: user.fullName,
    is_active: true,
  })));

  await upsert('restaurants', restaurants.map(({ ownerKey, ...restaurant }) => ({
    ...restaurant,
    owner_id: userIds[ownerKey],
    is_active: true,
  })));

  await upsert('menu_categories', categories.map(({ restaurantIndex, ...category }) => ({
    ...category,
    restaurant_id: restaurants[restaurantIndex].id,
    is_active: true,
  })));

  await upsert('menu_items', menuRows);

  await upsert('riders', riders.map((rider) => ({
    id: userIds[rider.key],
    vehicle_type: rider.vehicle_type,
    vehicle_number: rider.vehicle_number,
    max_concurrent_orders: rider.max_concurrent_orders,
    is_available: true,
    verification_status: 'verified',
    current_latitude: rider.lat,
    current_longitude: rider.lon,
    last_location_at: now.toISOString(),
    rating: 4.5,
  })));

  // Demo shifts cover the current time so manual dispatch eligibility checks pass
  // during a walkthrough. The long window avoids becoming stale within one day.
  await upsert('rider_shifts', riders.map((rider, index) => ({
    id: `99999999-9999-4999-8999-9999999999${String(index + 1).padStart(2, '0')}`,
    rider_id: userIds[rider.key],
    starts_at: new Date(now.getTime() - 60 * 60_000).toISOString(),
    ends_at: new Date(now.getTime() + (8 + index) * 60 * 60_000).toISOString(),
    break_minutes: 30,
    status: 'scheduled',
    notes: 'Demo shift covering the current demo window',
  })));

  await upsert('customer_addresses', addresses.map(({ customerKey, ...address }) => ({
    ...address,
    customer_id: userIds[customerKey],
    city: 'Belagavi',
    state: 'Karnataka',
  })));

  await upsert('orders', orders.map((order) => ({
    id: order.id,
    customer_id: userIds[order.customerKey],
    restaurant_id: restaurants[order.restaurantIndex].id,
    delivery_address_id: addresses[order.addressIndex].id,
    status: order.status,
    priority: order.priority,
    subtotal_minor: order.subtotal,
    delivery_fee_minor: order.fee,
    discount_minor: order.discount,
    total_minor: order.subtotal + order.fee - order.discount,
    currency: 'INR',
    delivery_window_start: order.start,
    delivery_window_end: order.end,
    prep_time_minutes: order.prep,
    delivery_address_line: addresses[order.addressIndex].address_line1,
    delivery_latitude: addresses[order.addressIndex].latitude,
    delivery_longitude: addresses[order.addressIndex].longitude,
    delivery_contact_phone: addresses[order.addressIndex].phone,
    special_instructions: 'Demo order created by the development seed script.',
  })));

  await upsert('order_items', orderItemRows);

  console.log('Demo seed complete (idempotent upserts).');
  console.log(`Users: ${users.length} · restaurants: ${restaurants.length} · menu items: ${menuRows.length}`);
  console.log(`Riders: ${riders.length} · addresses: ${addresses.length} · orders: ${orders.length}`);
  console.log('No passwords, keys or tokens were printed.');
}

main().catch((error) => {
  console.error('Seed failed:', error?.message ?? 'unknown error');
  process.exit(1);
});

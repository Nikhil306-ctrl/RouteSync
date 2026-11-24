export const RESTAURANT_IMAGES = {
  'belagavi-spice-house': {
    src: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=1400&q=80',
    alt: 'Indian curries and breads arranged for a shared meal',
  },
  'north-karnataka-kitchen': {
    src: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=1400&q=80',
    alt: 'Traditional Indian meal served with rice and curries',
  },
  'chennamma-cafe': {
    src: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
    alt: 'Warm cafe interior with tables and pendant lighting',
  },
};

const FOOD_IMAGES = {
  biryani: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=900&q=80',
  thali: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=900&q=80',
  curry: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=900&q=80',
  roti: 'https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=900&q=80',
  rice: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=900&q=80',
  kebab: 'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=900&q=80',
  sandwich: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80',
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80',
  fries: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=900&q=80',
  coffee: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
  chai: 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=900&q=80',
  lime: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80',
  dessert: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?auto=format&fit=crop&w=900&q=80',
  paneer: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=900&q=80',
  default: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
};

export function restaurantImage(restaurant) {
  if (!restaurant) return { src: null, alt: 'Restaurant' };
  return (
    RESTAURANT_IMAGES[restaurant.slug] ?? {
      src: restaurant.image_url ?? null,
      alt: restaurant.name ? `${restaurant.name} dining` : 'Restaurant',
    }
  );
}

export function menuItemImage(item) {
  if (!item) return { src: FOOD_IMAGES.default, alt: 'Dish' };
  if (item.image_url) return { src: item.image_url, alt: item.name ?? 'Dish' };

  const name = String(item.name ?? '').toLowerCase();
  let key = 'default';
  if (name.includes('biryani')) key = 'biryani';
  else if (name.includes('thali') || name.includes('meal')) key = 'thali';
  else if (name.includes('sandwich')) key = 'sandwich';
  else if (name.includes('burger')) key = 'burger';
  else if (name.includes('fries')) key = 'fries';
  else if (name.includes('coffee')) key = 'coffee';
  else if (name.includes('chai') || name.includes('tea')) key = 'chai';
  else if (name.includes('lime') || name.includes('soda')) key = 'lime';
  else if (name.includes('jamun') || name.includes('holige') || name.includes('brownie')) key = 'dessert';
  else if (name.includes('roti') || name.includes('chapati')) key = 'roti';
  else if (name.includes('rice') || name.includes('sambar')) key = 'rice';
  else if (name.includes('kabab') || name.includes('kebab')) key = 'kebab';
  else if (name.includes('paneer') || name.includes('tikka')) key = 'paneer';
  else if (name.includes('curry') || name.includes('dal')) key = 'curry';

  return { src: FOOD_IMAGES[key], alt: item.name ?? 'Dish' };
}

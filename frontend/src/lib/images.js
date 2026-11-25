const photo = (id, extension = 'jpeg') =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.${extension}?auto=compress&cs=tinysrgb&w=900`;

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

const DISH_PHOTOS = {
  'paneer tikka': { src: photo(33430556), alt: 'Grilled paneer tikka with peppers and chutney' },
  'chicken kabab': { src: photo(31648205), alt: 'Grilled chicken kebabs on skewers' },
  'belagavi thali': { src: photo(35008222), alt: 'Indian thali with chapati, rice, dal and vegetables' },
  'jowar roti meal': { src: photo(1051399), alt: 'Roti meal with vegetables and onions' },
  'veg biryani': { src: photo(35041642), alt: 'Vegetable biryani with rice and vegetables' },
  'chicken biryani': { src: photo(28674660), alt: 'Chicken biryani served with curry' },
  'dal tadka': { src: photo(38108860), alt: 'Dal tadka garnished with herbs in a bowl' },
  'gulab jamun': { src: photo(7406887), alt: 'Gulab jamun sweets soaking in syrup' },
  'ragi mudde meal': { src: photo(37421007), alt: 'Indian flatbread and lentil meal' },
  'north karnataka thali': { src: photo(39323513), alt: 'Indian thali with roti, lentils and vegetables' },
  'chicken curry': { src: photo(35532821), alt: 'Indian chicken curry in a bowl' },
  holige: { src: photo(37785546), alt: 'Freshly baked sweet flatbread' },
  'jolada rotti': { src: photo(35066812), alt: 'Indian flatbread served in a basket' },
  chapati: { src: photo(9797029), alt: 'Chapati flatbread in a woven basket' },
  rice: { src: photo(7593253), alt: 'Seasoned rice in a bowl' },
  sambar: { src: photo(35514447), alt: 'South Indian sambar served with idli' },
  'veg sandwich': { src: photo(30107969), alt: 'Vegetable sandwich with fresh vegetables' },
  'chicken sandwich': { src: photo(33014388), alt: 'Chicken sandwich with fries' },
  'french fries': { src: photo(18339330), alt: 'Crisp french fries with seasoning' },
  'veg burger': { src: photo(19709551), alt: 'Vegetable burger with chips and sauce' },
  'chocolate brownie': { src: photo(33674422), alt: 'Chocolate brownie with ice cream' },
  'filter coffee': { src: photo(38201891, 'png'), alt: 'South Indian filter coffee in a steel tumbler' },
  'masala chai': { src: photo(29650995), alt: 'Masala chai with ginger' },
  'fresh lime soda': { src: photo(38441763), alt: 'Lime soda with ice' },
};

const normalize = (value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

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
  if (!item) return { src: null, alt: 'Dish' };
  if (item.image_url) return { src: item.image_url, alt: item.name ?? 'Dish' };

  const name = normalize(item.name);
  const match = DISH_PHOTOS[name];
  if (match) return match;

  const key = Object.keys(DISH_PHOTOS).find((dish) => name.startsWith(`${dish} `));
  return key ? DISH_PHOTOS[key] : { src: null, alt: item.name ?? 'Dish' };
}

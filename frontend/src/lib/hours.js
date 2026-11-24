/**
 * Advisory restaurant-hours check for the browser.
 *
 * The trusted order functions use Asia/Kolkata time on the server. This helper
 * mirrors the same open/closed logic using the viewer's clock so menus can show
 * an honest status and the checkout still treats the server quote as final.
 */
export function isRestaurantOpenNow(restaurant, now = new Date()) {
  if (!restaurant?.opening_time || !restaurant?.closing_time) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const [openHour, openMinute] = String(restaurant.opening_time).split(':').map(Number);
  const [closeHour, closeMinute] = String(restaurant.closing_time).split(':').map(Number);
  const opens = openHour * 60 + openMinute;
  const closes = closeHour * 60 + closeMinute;

  if (![opens, closes].every(Number.isFinite)) return false;
  return closes < opens ? minutes >= opens || minutes < closes : minutes >= opens && minutes < closes;
}

export const ROLE_PATHS = Object.freeze({
  admin: '/admin',
  restaurant: '/restaurant',
  rider: '/delivery-partner',
  customer: '/customer',
});

export const PORTAL_ROLES = Object.freeze({
  '/admin': ['admin'],
  '/restaurant': ['restaurant'],
  '/delivery-partner': ['rider'],
  '/customer': ['customer'],
});

export const ROLE_LABELS = Object.freeze({
  admin: 'Admin / Dispatcher',
  restaurant: 'Restaurant',
  rider: 'Delivery Partner',
  customer: 'Customer',
});

export function getPortalPath(role) {
  return ROLE_PATHS[role] ?? '/login';
}

export function canAccessPortal(role, path) {
  const allowed = PORTAL_ROLES[path];
  return Boolean(allowed && role && allowed.includes(role));
}

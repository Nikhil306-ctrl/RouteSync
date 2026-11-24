/**
 * Role routing + portal protection audit. Runs offline in Node.
 *
 * Imports the real frontend role map (frontend/src/lib/roles.js) and inspects
 * the real router to prove that each portal is wrapped by ProtectedRoute and
 * that the role → path mapping matches the database app_role enum.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ROLE_PATHS,
  PORTAL_ROLES,
  ROLE_LABELS,
  getPortalPath,
  canAccessPortal,
} from '../frontend/src/lib/roles.js';

const testsDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testsDir, '..');
const frontendSrc = path.join(projectRoot, 'frontend', 'src');
const routerSource = fs.readFileSync(path.join(frontendSrc, 'router.jsx'), 'utf8');
const homeSource = fs.readFileSync(path.join(frontendSrc, 'pages', 'HomePage.jsx'), 'utf8');
const protectedRouteSource = fs.readFileSync(
  path.join(frontendSrc, 'components', 'ProtectedRoute.jsx'),
  'utf8',
);
const portalLayoutSource = fs.readFileSync(
  path.join(frontendSrc, 'components', 'layout', 'PortalLayout.jsx'),
  'utf8',
);
const checkoutSource = fs.readFileSync(
  path.join(frontendSrc, 'portals', 'customer', 'pages', 'CheckoutPage.jsx'),
  'utf8',
);
const trackingSource = fs.readFileSync(
  path.join(frontendSrc, 'portals', 'customer', 'pages', 'CustomerOrderTracking.jsx'),
  'utf8',
);
const lifecyclePortalSources = {
  kitchen: fs.readFileSync(
    path.join(frontendSrc, 'portals', 'restaurant', 'pages', 'KitchenBoard.jsx'),
    'utf8',
  ),
  adminOrders: fs.readFileSync(
    path.join(frontendSrc, 'portals', 'admin', 'pages', 'AdminOrders.jsx'),
    'utf8',
  ),
  adminDispatch: fs.readFileSync(
    path.join(frontendSrc, 'portals', 'admin', 'pages', 'AdminDispatch.jsx'),
    'utf8',
  ),
  riderAssignments: fs.readFileSync(
    path.join(frontendSrc, 'portals', 'rider', 'pages', 'RiderAssignments.jsx'),
    'utf8',
  ),
  riderDetail: fs.readFileSync(
    path.join(frontendSrc, 'portals', 'rider', 'pages', 'RiderAssignmentDetail.jsx'),
    'utf8',
  ),
};
const enumsSource = fs.readFileSync(
  path.join(projectRoot, 'supabase', 'migrations', '20261124100100_enums.sql'),
  'utf8',
);

test('database app_role enum matches frontend role paths', () => {
  const enumBlock = enumsSource.match(/create type public\.app_role as enum \(([\s\S]*?)\);/i);
  assert.ok(enumBlock, 'app_role enum not found');
  const dbRoles = [...enumBlock[1].matchAll(/'([a-z_]+)'/gi)].map((match) => match[1]).sort();
  const frontendRoles = Object.keys(ROLE_PATHS).sort();
  assert.deepEqual(frontendRoles, dbRoles);
});

test('each role resolves to its own portal', () => {
  assert.equal(getPortalPath('admin'), '/admin');
  assert.equal(getPortalPath('restaurant'), '/restaurant');
  assert.equal(getPortalPath('rider'), '/delivery-partner');
  assert.equal(getPortalPath('customer'), '/customer');
});

test('unknown or missing roles never resolve to a protected portal', () => {
  assert.equal(getPortalPath(undefined), '/login');
  assert.equal(getPortalPath(null), '/login');
  assert.equal(getPortalPath('superuser'), '/login');
  assert.equal(getPortalPath(''), '/login');
});

test('portals accept exactly one role each', () => {
  for (const [portal, roles] of Object.entries(PORTAL_ROLES)) {
    assert.equal(roles.length, 1, `${portal} should be single-role`);
  }

  assert.equal(canAccessPortal('admin', '/admin'), true);
  assert.equal(canAccessPortal('customer', '/admin'), false);
  assert.equal(canAccessPortal('rider', '/restaurant'), false);
  assert.equal(canAccessPortal('rider', '/delivery-partner'), true);
  assert.equal(canAccessPortal('restaurant', '/customer'), false);
  assert.equal(canAccessPortal(null, '/customer'), false);
});

test('every role has a human-readable label', () => {
  for (const role of Object.keys(ROLE_PATHS)) {
    assert.ok(ROLE_LABELS[role], `missing label for ${role}`);
  }
});

test('all four portal routes are defined in the router', () => {
  for (const portal of Object.keys(PORTAL_ROLES)) {
    assert.match(routerSource, new RegExp(`path:\\s*'${portal}'`), `router missing ${portal}`);
  }
  assert.match(routerSource, /<ProtectedRoute path=\{portal\.path\}>/);
});

test('no portal route is registered outside ProtectedRoute', () => {
  for (const portal of Object.keys(PORTAL_ROLES)) {
    const directElement = new RegExp(`<Route\\s+path="${portal}"\\s+element=\\{<(?!ProtectedRoute)`);
    assert.doesNotMatch(routerSource, directElement, `${portal} registered without ProtectedRoute`);
  }
});

test('ProtectedRoute redirects anonymous users and wrong roles', () => {
  assert.match(protectedRouteSource, /if \(!session\)[\s\S]*?Navigate to="\/login"/);
  assert.match(protectedRouteSource, /getPortalPath\(role\)/);
  assert.match(protectedRouteSource, /canAccessPortal\(role, path\)/);
  assert.match(protectedRouteSource, /FullPageLoading/);
});

test('auth entry points are public routes', () => {
  for (const route of ['/login', '/register', '/forgot-password', '/reset-password']) {
    assert.match(routerSource, new RegExp(`<Route path="${route}" element=`), `missing public auth route ${route}`);
  }
});

test('legacy /delivery path redirects to the canonical portal', () => {
  assert.match(routerSource, /path="\/delivery"\s+element=\{<Navigate to="\/delivery-partner" replace \/>\}/);
  assert.doesNotMatch(homeSource, /to="\/delivery"/);
});

test('portal shell provides role-aware navigation and a working logout', () => {
  for (const role of Object.keys(ROLE_PATHS)) {
    assert.match(portalLayoutSource, new RegExp(`${role}:\\s*\\{`), `portal shell missing ${role} navigation`);
  }
  assert.match(portalLayoutSource, /await signOut\(\)/);
  assert.match(portalLayoutSource, /navigate\('\/login'/);
  assert.match(routerSource, /<PortalLayout role=\{portal\.role\}/);
  assert.doesNotMatch(routerSource, /PortalPlaceholder/);
});

test('portal pages are lazy-loaded instead of a placeholder', () => {
  assert.doesNotMatch(routerSource, /PortalPlaceholder/);

  const customerPages = [
    'CustomerRestaurants',
    'RestaurantDetail',
    'CartPage',
    'CheckoutPage',
    'CustomerOrders',
    'CustomerOrderDetail',
    'CustomerOrderTracking',
    'CustomerProfile',
  ];

  for (const page of customerPages) {
    assert.match(
      routerSource,
      new RegExp(`lazy\\(\\(\\) => import\\('\\.\\/portals\\/customer\\/pages\\/${page}\\.jsx'\\)\\)`),
      `router does not lazy-load ${page}`,
    );
    assert.ok(
      fs.existsSync(path.join(frontendSrc, 'portals', 'customer', 'pages', `${page}.jsx`)),
      `missing customer page ${page}`,
    );
  }
});

test('customer checkout uses the trusted quote and idempotent create endpoints', () => {
  assert.doesNotMatch(checkoutSource, /from\('orders'\)/);
  assert.doesNotMatch(checkoutSource, /\.insert\(/);
  assert.doesNotMatch(checkoutSource, /updateOrderStatus/);
  assert.match(checkoutSource, /quoteOrder/);
  assert.match(checkoutSource, /createCustomerOrder/);
  assert.match(checkoutSource, /newIdempotencyKey/);
  assert.match(checkoutSource, /cash_on_delivery/);
});

test('customer tracking discloses that live GPS is unavailable', () => {
  assert.match(trackingSource, /Live tracking is not available in this phase/);
  assert.match(trackingSource, /not a live GPS map/);
  assert.doesNotMatch(trackingSource, /MapContainer|Leaflet|google\.maps/i);
});

test('lifecycle portals call trusted Worker endpoints instead of direct order writes', () => {
  for (const [name, source] of Object.entries(lifecyclePortalSources)) {
    assert.doesNotMatch(source, /from\('orders'\)/, `${name} writes orders directly`);
    assert.doesNotMatch(source, /from\('assignments'\)/, `${name} writes assignments directly`);
    assert.doesNotMatch(source, /updateOrderStatus/, `${name} uses the old browser status writer`);
    assert.doesNotMatch(source, /\.insert\(/, `${name} inserts rows from the browser`);
    assert.doesNotMatch(source, /\.update\(/, `${name} updates rows from the browser`);
  }

  assert.match(lifecyclePortalSources.kitchen, /transitionRestaurantOrder/);
  assert.match(lifecyclePortalSources.adminOrders, /transitionAdminOrder/);
  assert.match(lifecyclePortalSources.adminDispatch, /assignRider/);
  assert.match(lifecyclePortalSources.riderDetail, /respondToAssignment/);
  assert.match(lifecyclePortalSources.riderDetail, /transitionRiderOrder/);
});

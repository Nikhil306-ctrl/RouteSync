import { lazy, Suspense } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import PortalLayout from './components/layout/PortalLayout.jsx';
import BrandMark from './components/BrandMark.jsx';
import FullPageLoading from './components/FullPageLoading.jsx';

const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage.jsx'));
const NotificationsPage = lazy(() => import('./pages/shared/NotificationsPage.jsx'));
const AccountSettingsPage = lazy(() => import('./pages/shared/AccountSettingsPage.jsx'));

const AdminDashboard = lazy(() => import('./portals/admin/pages/AdminDashboard.jsx'));
const AdminOrders = lazy(() => import('./portals/admin/pages/AdminOrders.jsx'));
const AdminDispatch = lazy(() => import('./portals/admin/pages/AdminDispatch.jsx'));
const AdminRoutes = lazy(() => import('./portals/admin/pages/AdminRoutes.jsx'));
const AdminLiveTracking = lazy(() => import('./portals/admin/pages/AdminLiveTracking.jsx'));
const AdminRiders = lazy(() => import('./portals/admin/pages/AdminRiders.jsx'));
const AdminRestaurants = lazy(() => import('./portals/admin/pages/AdminRestaurants.jsx'));
const AdminViolations = lazy(() => import('./portals/admin/pages/AdminViolations.jsx'));
const AdminRescheduling = lazy(() => import('./portals/admin/pages/AdminRescheduling.jsx'));
const AdminAnalytics = lazy(() => import('./portals/admin/pages/AdminAnalytics.jsx'));
const AdminAudit = lazy(() => import('./portals/admin/pages/AdminAudit.jsx'));

const RestaurantDashboard = lazy(() => import('./portals/restaurant/pages/RestaurantDashboard.jsx'));
const KitchenBoard = lazy(() => import('./portals/restaurant/pages/KitchenBoard.jsx'));
const RestaurantMenu = lazy(() => import('./portals/restaurant/pages/RestaurantMenu.jsx'));
const RestaurantProfile = lazy(() => import('./portals/restaurant/pages/RestaurantProfile.jsx'));

const RiderDashboard = lazy(() => import('./portals/rider/pages/RiderDashboard.jsx'));
const RiderAssignments = lazy(() => import('./portals/rider/pages/RiderAssignments.jsx'));
const RiderAssignmentDetail = lazy(() => import('./portals/rider/pages/RiderAssignmentDetail.jsx'));
const RiderRoute = lazy(() => import('./portals/rider/pages/RiderRoute.jsx'));
const RiderShifts = lazy(() => import('./portals/rider/pages/RiderShifts.jsx'));
const RiderHistory = lazy(() => import('./portals/rider/pages/RiderHistory.jsx'));
const RiderProfile = lazy(() => import('./portals/rider/pages/RiderProfile.jsx'));

const CustomerRestaurants = lazy(() => import('./portals/customer/pages/CustomerRestaurants.jsx'));
const RestaurantDetail = lazy(() => import('./portals/customer/pages/RestaurantDetail.jsx'));
const CartPage = lazy(() => import('./portals/customer/pages/CartPage.jsx'));
const CheckoutPage = lazy(() => import('./portals/customer/pages/CheckoutPage.jsx'));
const CustomerOrders = lazy(() => import('./portals/customer/pages/CustomerOrders.jsx'));
const CustomerOrderDetail = lazy(() => import('./portals/customer/pages/CustomerOrderDetail.jsx'));
const CustomerOrderTracking = lazy(() => import('./portals/customer/pages/CustomerOrderTracking.jsx'));
const CustomerProfile = lazy(() => import('./portals/customer/pages/CustomerProfile.jsx'));

const portalRoutes = [
  {
    path: '/admin',
    role: 'admin',
    name: 'Admin / Dispatcher',
    routes: [
      { index: true, element: <AdminDashboard /> },
      { path: 'orders', element: <AdminOrders /> },
      { path: 'dispatch', element: <AdminDispatch /> },
      { path: 'routes', element: <AdminRoutes /> },
      { path: 'tracking', element: <AdminLiveTracking /> },
      { path: 'riders', element: <AdminRiders /> },
      { path: 'restaurants', element: <AdminRestaurants /> },
      { path: 'violations', element: <AdminViolations /> },
      { path: 'rescheduling', element: <AdminRescheduling /> },
      { path: 'analytics', element: <AdminAnalytics /> },
      { path: 'audit', element: <AdminAudit /> },
      { path: 'notifications', element: <NotificationsPage eyebrow="Operations" title="Notifications" /> },
      { path: 'settings', element: <AccountSettingsPage eyebrow="Operations" title="Account settings" /> },
    ],
  },
  {
    path: '/restaurant',
    role: 'restaurant',
    name: 'Restaurant',
    routes: [
      { index: true, element: <RestaurantDashboard /> },
      { path: 'kitchen', element: <KitchenBoard /> },
      { path: 'menu', element: <RestaurantMenu /> },
      { path: 'profile', element: <RestaurantProfile /> },
      { path: 'notifications', element: <NotificationsPage eyebrow="Restaurant workspace" title="Notifications" /> },
      { path: 'settings', element: <AccountSettingsPage eyebrow="Restaurant workspace" title="Account settings" /> },
    ],
  },
  {
    path: '/delivery-partner',
    role: 'rider',
    name: 'Delivery Partner',
    routes: [
      { index: true, element: <RiderDashboard /> },
      { path: 'assignments', element: <RiderAssignments /> },
      { path: 'assignments/:assignmentId', element: <RiderAssignmentDetail /> },
      { path: 'route', element: <RiderRoute /> },
      { path: 'shifts', element: <RiderShifts /> },
      { path: 'history', element: <RiderHistory /> },
      { path: 'notifications', element: <NotificationsPage eyebrow="Delivery partner" title="Notifications" /> },
      { path: 'profile', element: <RiderProfile /> },
      { path: 'settings', element: <AccountSettingsPage eyebrow="Delivery partner" title="Account settings" /> },
    ],
  },
  {
    path: '/customer',
    role: 'customer',
    name: 'Customer',
    routes: [
      { index: true, element: <CustomerRestaurants /> },
      { path: 'restaurants/:slug', element: <RestaurantDetail /> },
      { path: 'cart', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'orders', element: <CustomerOrders /> },
      { path: 'orders/:orderId', element: <CustomerOrderDetail /> },
      { path: 'orders/:orderId/tracking', element: <CustomerOrderTracking /> },
      { path: 'profile', element: <CustomerProfile /> },
      { path: 'notifications', element: <NotificationsPage eyebrow="Customer account" title="Notifications" /> },
      { path: 'settings', element: <AccountSettingsPage eyebrow="Customer account" title="Account settings" /> },
    ],
  },
];

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-6 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex justify-center">
          <BrandMark to={null} />
        </div>
        <p className="rs-eyebrow mt-6 text-accent">404 · Off route</p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink">This page is not on the route map</h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          The address you opened does not match a defined RouteSync screen. Return to the public site or
          open your own workspace from the sign-in page.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Link
            to="/"
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            Return home
          </Link>
          <Link
            to="/login"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<FullPageLoading label="Loading RouteSync…" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/delivery" element={<Navigate to="/delivery-partner" replace />} />

          {portalRoutes.map((portal) => (
            <Route
              key={portal.path}
              path={portal.path}
              element={
                <ProtectedRoute path={portal.path}>
                  <PortalLayout role={portal.role} />
                </ProtectedRoute>
              }
            >
              {portal.routes.map((route, index) => (
                <Route
                  key={route.path ?? `index-${index}`}
                  index={route.index}
                  path={route.path}
                  element={route.element}
                />
              ))}
              <Route path="*" element={<Navigate to={portal.path} replace />} />
            </Route>
          ))}

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

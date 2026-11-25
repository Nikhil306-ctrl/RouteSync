import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  Bike,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  CookingPot,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Navigation,
  Package,
  ReceiptText,
  Route as RouteIcon,
  ScrollText,
  Search,
  Settings,
  ShoppingBag,
  Store,
  TriangleAlert,
  UserRound,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import BrandMark from '../BrandMark.jsx';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useCart } from '../../hooks/useCart.jsx';
import { initials, todayLabel } from '../../lib/format.js';

const navigation = {
  admin: {
    label: 'Operations control',
    shortLabel: 'Admin',
    home: '/admin',
    groups: [
      {
        label: 'Operations',
        items: [
          { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
          { to: '/admin/dispatch', label: 'Scheduling & dispatch', icon: CalendarClock },
          { to: '/admin/routes', label: 'Delivery routes', icon: RouteIcon },
          { to: '/admin/tracking', label: 'Live tracking', icon: Navigation },
        ],
      },
      {
        label: 'Network',
        items: [
          { to: '/admin/riders', label: 'Delivery partners', icon: Bike },
          { to: '/admin/restaurants', label: 'Restaurants', icon: Store },
          { to: '/admin/violations', label: 'Constraints & conflicts', icon: TriangleAlert },
        ],
      },
      {
        label: 'Analysis',
        items: [
          { to: '/admin/rescheduling', label: 'Rescheduling history', icon: History },
          { to: '/admin/analytics', label: 'Analytics & reports', icon: BarChart3 },
          { to: '/admin/audit', label: 'Audit history', icon: ScrollText },
        ],
      },
      {
        label: 'Account',
        items: [
          { to: '/admin/notifications', label: 'Notifications', icon: Bell },
          { to: '/admin/settings', label: 'Account settings', icon: Settings },
        ],
      },
    ],
  },
  restaurant: {
    label: 'Restaurant workspace',
    shortLabel: 'Restaurant',
    home: '/restaurant',
    groups: [
      {
        label: 'Service',
        items: [
          { to: '/restaurant', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/restaurant/kitchen', label: 'Kitchen board', icon: CookingPot },
          { to: '/restaurant/menu', label: 'Menu & availability', icon: UtensilsCrossed },
        ],
      },
      {
        label: 'Business',
        items: [
          { to: '/restaurant/profile', label: 'Restaurant profile', icon: Store },
          { to: '/restaurant/notifications', label: 'Notifications', icon: Bell },
          { to: '/restaurant/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
  },
  rider: {
    label: 'Delivery partner',
    shortLabel: 'Rider',
    home: '/delivery-partner',
    groups: [
      {
        label: 'My day',
        items: [
          { to: '/delivery-partner', label: 'Overview', icon: LayoutDashboard, end: true },
          { to: '/delivery-partner/assignments', label: 'Assignments', icon: Package },
          { to: '/delivery-partner/route', label: 'Route', icon: RouteIcon },
          { to: '/delivery-partner/shifts', label: 'Shifts', icon: CalendarDays },
        ],
      },
      {
        label: 'Records',
        items: [
          { to: '/delivery-partner/history', label: 'Delivery history', icon: History },
          { to: '/delivery-partner/notifications', label: 'Notifications', icon: Bell },
          { to: '/delivery-partner/profile', label: 'Profile & vehicle', icon: UserRound },
          { to: '/delivery-partner/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
    mobile: [
      { to: '/delivery-partner', label: 'Today', icon: LayoutDashboard, end: true },
      { to: '/delivery-partner/assignments', label: 'Tasks', icon: Package },
      { to: '/delivery-partner/route', label: 'Route', icon: RouteIcon },
      { to: '/delivery-partner/history', label: 'History', icon: History },
      { to: '/delivery-partner/profile', label: 'Profile', icon: UserRound },
    ],
  },
  customer: {
    label: 'Customer',
    shortLabel: 'Customer',
    home: '/customer',
    groups: [
      {
        label: 'Order',
        items: [
          { to: '/customer', label: 'Discover restaurants', icon: Search, end: true },
          { to: '/customer/orders', label: 'My orders', icon: ReceiptText },
          { to: '/customer/cart', label: 'Cart', icon: ShoppingBag, badge: 'cart' },
        ],
      },
      {
        label: 'Account',
        items: [
          { to: '/customer/profile', label: 'Profile & addresses', icon: UserRound },
          { to: '/customer/notifications', label: 'Notifications', icon: Bell },
          { to: '/customer/settings', label: 'Settings', icon: Settings },
        ],
      },
    ],
    mobile: [
      { to: '/customer', label: 'Discover', icon: Search, end: true },
      { to: '/customer/orders', label: 'Orders', icon: ReceiptText },
      { to: '/customer/cart', label: 'Cart', icon: ShoppingBag, badge: 'cart' },
      { to: '/customer/profile', label: 'Profile', icon: UserRound },
    ],
  },
};

function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError('');
    try {
      await signOut();
      navigate('/login', { replace: true, state: { message: 'You have been signed out.' } });
    } catch (error) {
      setSignOutError(error.message ?? 'Sign out failed. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return { signingOut, signOutError, handleSignOut };
}

function SidebarNav({ config, dark, onNavigate }) {
  const { count } = useCart();

  return (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label={`${config.label} navigation`}>
      {config.groups.map((group) => (
        <div key={group.label}>
          <p className={`px-3 text-xs font-semibold ${dark ? 'text-slate-500' : 'text-muted'}`}>
            {group.label}
          </p>
          <div className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive
                        ? dark
                          ? 'bg-white/[0.09] text-white shadow-[inset_2px_0_0_#ea6b33]'
                          : 'bg-warm text-accent-strong shadow-[inset_2px_0_0_#c34a19]'
                        : dark
                          ? 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                          : 'text-[#4b585d] hover:bg-[#eef2f0] hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`h-[17px] w-[17px] shrink-0 ${
                          isActive ? (dark ? 'text-orange-400' : 'text-accent') : dark ? 'text-slate-500' : 'text-slate-400'
                        }`}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.badge === 'cart' && count > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[0.62rem] font-bold tabular-nums text-white">
                          {count}
                        </span>
                      ) : null}
                      {isActive ? (
                        <span className={`h-1.5 w-1.5 rounded-full ${dark ? 'bg-orange-400' : 'bg-accent'}`} aria-hidden="true" />
                      ) : null}
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarAccount({ dark }) {
  const { profile, user } = useAuth();
  const { signingOut, signOutError, handleSignOut } = useSignOut();

  return (
    <div className={`border-t px-3 py-4 ${dark ? 'border-white/10' : 'border-line'}`}>
      <div className="flex items-center gap-3 px-2">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xs font-bold ${
            dark ? 'bg-orange-500/20 text-orange-300' : 'bg-warm text-accent'
          }`}
        >
          {initials(profile?.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-bold ${dark ? 'text-white' : 'text-ink'}`}>
            {profile?.full_name || 'RouteSync user'}
          </p>
          <p className={`truncate text-xs ${dark ? 'text-slate-500' : 'text-muted'}`}>{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-bold ${
            dark ? 'text-slate-500 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
          }`}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          <span>{signingOut ? 'Signing out' : 'Sign out'}</span>
        </button>
      </div>
      {signOutError ? <p className="mt-2 px-2 text-xs text-red-600" role="alert">{signOutError}</p> : null}
    </div>
  );
}

function findCurrentNav(config, pathname) {
  const all = config.groups.flatMap((group) => group.items);
  return (
    all
      .filter((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)))
      .sort((a, b) => b.to.length - a.to.length)[0] ?? all[0]
  );
}

function WorkspaceLayout({ role }) {
  const config = navigation[role];
  const dark = role === 'admin';
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current = useMemo(() => findCurrentNav(config, location.pathname), [config, location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const sidebar = (mobile = false) => (
    <div className={`flex h-full flex-col ${dark ? 'bg-ink text-white' : 'bg-white'}`}>
      <div className={`flex h-16 shrink-0 items-center justify-between border-b px-5 ${dark ? 'border-white/10' : 'border-line'}`}>
        <BrandMark dark={dark} to={config.home} />
        {mobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className={`grid h-9 w-9 place-items-center rounded-lg ${dark ? 'text-slate-400 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className={`border-b px-5 py-3 ${dark ? 'border-white/10' : 'border-line'}`}>
        <p className={`text-xs font-semibold ${dark ? 'text-orange-300' : 'text-accent'}`}>
          {config.label}
        </p>
      </div>
      <SidebarNav config={config} dark={dark} onNavigate={mobile ? () => setMobileOpen(false) : undefined} />
      <SidebarAccount dark={dark} />
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-line lg:block">{sidebar()}</aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 bg-ink/55" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-[282px] shadow-2xl">{sidebar(true)}</aside>
        </div>
      ) : null}

      <div className="lg:pl-[272px]">
        <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="grid h-10 w-10 place-items-center rounded-lg border border-line text-slate-600 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <span>{config.shortLabel}</span>
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
                <span className="truncate text-slate-600">{current?.label ?? 'Workspace'}</span>
              </div>
              <p className="mt-0.5 hidden text-xs text-muted sm:block">{todayLabel()}</p>
            </div>
            <Link
              to={`/${role === 'restaurant' ? 'restaurant' : 'admin'}/notifications`}
              className="relative grid h-10 w-10 place-items-center rounded-lg border border-line text-slate-500 hover:bg-slate-50 hover:text-ink"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <div className="hidden items-center gap-2 rounded-lg border border-line bg-slate-50 px-2.5 py-1.5 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 live-dot" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-slate-600">Live Supabase data</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function RiderLayout() {
  const config = navigation.rider;
  const location = useLocation();
  const current = useMemo(() => findCurrentNav(config, location.pathname), [config, location.pathname]);
  const { profile } = useAuth();

  return (
    <div className="min-h-screen bg-canvas pb-20 lg:pb-0">
      <header className="bg-ink text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark dark to="/delivery-partner" />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Delivery partner">
            {config.groups.flatMap((group) => group.items).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-xs font-bold transition ${
                    isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/delivery-partner/notifications"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <Link
              to="/delivery-partner/profile"
              className="grid h-9 w-9 place-items-center rounded-lg bg-orange-500/20 text-xs font-bold text-orange-200"
              aria-label="Profile"
            >
              {initials(profile?.full_name)}
            </Link>
          </div>
        </div>
        <div className="border-t border-white/10 lg:hidden">
          <div className="mx-auto flex h-10 max-w-6xl items-center justify-between px-4 text-xs text-slate-400">
            <span className="font-semibold text-slate-300">{current?.label}</span>
            <span>{todayLabel()}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-safe lg:hidden" aria-label="Delivery partner mobile">
        <div className="grid grid-cols-5">
          {config.mobile.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 text-[0.62rem] font-bold ${
                    isActive ? 'text-accent' : 'text-slate-500'
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function CustomerLayout() {
  const { profile } = useAuth();
  const { count } = useCart();
  const location = useLocation();

  const links = [
    { to: '/customer', label: 'Discover', end: true },
    { to: '/customer/orders', label: 'My orders' },
  ];

  return (
    <div className="min-h-screen bg-canvas pb-20 lg:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <BrandMark to="/customer" />
            <nav className="hidden items-center gap-1 md:flex" aria-label="Customer">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      isActive ? 'bg-orange-50 text-orange-900' : 'text-slate-600 hover:bg-slate-100 hover:text-ink'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <Link
              to="/customer/notifications"
              className={`relative grid h-9 w-9 place-items-center rounded-lg transition ${
                location.pathname.startsWith('/customer/notifications')
                  ? 'bg-orange-50 text-accent'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-ink'
              }`}
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <Link
              to="/customer/cart"
              className="relative inline-flex min-h-9 items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-ink hover:border-slate-300 hover:bg-slate-50"
            >
              <ShoppingBag className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[0.62rem] font-bold text-white">
                  {count}
                </span>
              ) : null}
            </Link>
            <Link
              to="/customer/profile"
              className="ml-1 grid h-9 w-9 place-items-center rounded-lg bg-ink text-xs font-bold text-white"
              aria-label="Profile and addresses"
            >
              {initials(profile?.full_name)}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white pb-safe md:hidden" aria-label="Customer mobile">
        <div className="grid grid-cols-4">
          {navigation.customer.mobile.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `relative flex min-h-14 flex-col items-center justify-center gap-1 text-[0.62rem] font-bold ${
                    isActive ? 'text-accent' : 'text-slate-500'
                  }`
                }
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
                {item.badge === 'cart' && count > 0 ? (
                  <span className="absolute right-[calc(50%-16px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.55rem] text-white">
                    {count}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function PortalLayout({ role }) {
  if (role === 'rider') return <RiderLayout />;
  if (role === 'customer') return <CustomerLayout />;
  return <WorkspaceLayout role={role} />;
}

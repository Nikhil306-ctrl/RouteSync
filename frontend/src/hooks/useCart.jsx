import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'routesync.cart.v1';
const CartContext = createContext(null);

function readCart() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.menuItemId && item?.restaurantId && Number(item?.priceMinor) >= 0)
      .map((item) => ({
        menuItemId: String(item.menuItemId),
        restaurantId: String(item.restaurantId),
        restaurantName: String(item.restaurantName ?? ''),
        restaurantSlug: item.restaurantSlug ? String(item.restaurantSlug) : null,
        name: String(item.name ?? 'Menu item'),
        priceMinor: Number(item.priceMinor),
        quantity: Math.max(1, Math.min(50, Number(item.quantity) || 1)),
        imageUrl: item.imageUrl ? String(item.imageUrl) : null,
      }));
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readCart);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can be unavailable in private browsing; the in-memory cart still works.
    }
  }, [items]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === STORAGE_KEY) setItems(readCart());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addItem = useCallback(
    (item, quantity = 1) => {
      const differentRestaurant =
        items.length > 0 && items.some((entry) => entry.restaurantId !== String(item.restaurantId));
      if (differentRestaurant) return { added: false, conflict: true };

      setItems((current) => {
        const existing = current.find((entry) => entry.menuItemId === String(item.menuItemId));
        if (existing) {
          return current.map((entry) =>
            entry.menuItemId === String(item.menuItemId)
              ? { ...entry, quantity: Math.min(50, entry.quantity + quantity) }
              : entry,
          );
        }

        return [
          ...current,
          {
            menuItemId: String(item.menuItemId),
            restaurantId: String(item.restaurantId),
            restaurantName: String(item.restaurantName ?? ''),
            restaurantSlug: item.restaurantSlug ?? null,
            name: String(item.name ?? 'Menu item'),
            priceMinor: Number(item.priceMinor ?? 0),
            quantity: Math.max(1, Math.min(50, quantity)),
            imageUrl: item.imageUrl ?? null,
          },
        ];
      });
      return { added: true, conflict: false };
    },
    [items],
  );

  const replaceCart = useCallback((item, quantity = 1) => {
    setItems([
      {
        menuItemId: String(item.menuItemId),
        restaurantId: String(item.restaurantId),
        restaurantName: String(item.restaurantName ?? ''),
        restaurantSlug: item.restaurantSlug ?? null,
        name: String(item.name ?? 'Menu item'),
        priceMinor: Number(item.priceMinor ?? 0),
        quantity: Math.max(1, Math.min(50, quantity)),
        imageUrl: item.imageUrl ?? null,
      },
    ]);
  }, []);

  const increment = useCallback((menuItemId) => {
    setItems((current) =>
      current.map((item) =>
        item.menuItemId === menuItemId ? { ...item, quantity: Math.min(50, item.quantity + 1) } : item,
      ),
    );
  }, []);

  const decrement = useCallback((menuItemId) => {
    setItems((current) =>
      current
        .map((item) =>
          item.menuItemId === menuItemId ? { ...item, quantity: item.quantity - 1 } : item,
        )
        .filter((item) => item.quantity > 0),
    );
  }, []);

  const remove = useCallback((menuItemId) => {
    setItems((current) => current.filter((item) => item.menuItemId !== menuItemId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(() => {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalMinor = items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
    return {
      items,
      count,
      subtotalMinor,
      restaurantId: items[0]?.restaurantId ?? null,
      restaurantName: items[0]?.restaurantName ?? null,
      restaurantSlug: items[0]?.restaurantSlug ?? null,
      addItem,
      replaceCart,
      increment,
      decrement,
      remove,
      clear,
    };
  }, [items, addItem, replaceCart, increment, decrement, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider.');
  return context;
}

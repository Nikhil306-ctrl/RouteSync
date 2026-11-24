import { useState } from 'react';

/**
 * Remote food photography with a local, route-inspired fallback so a blocked
 * network request never leaves a broken image in the interface.
 */
export default function FoodImage({
  src,
  alt = '',
  className = '',
  fallback = 'dish',
  loading = 'lazy',
}) {
  const [failed, setFailed] = useState(false);
  const fallbackSrc = fallback === 'restaurant' ? '/images/restaurant-fallback.svg' : '/images/dish-fallback.svg';

  return (
    <img
      src={failed || !src ? fallbackSrc : src}
      alt={alt}
      loading={loading}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`h-full w-full object-cover ${className}`}
    />
  );
}

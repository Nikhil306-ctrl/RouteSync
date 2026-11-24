// Centralized Worker error handling. Never serialize raw errors or env values.
export function notFoundHandler(c) {
  return c.json(
    { error: { code: 'NOT_FOUND', message: 'Route not found.' } },
    404,
  );
}

export function errorHandler(error, c) {
  console.error('[routesync] request failed:', error?.message ?? 'unknown error');
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
    500,
  );
}

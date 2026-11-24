import { createUserScopedSupabase } from '../lib/supabase.js';

const unauthorized = (c, message = 'Authentication required.') =>
  c.json({ error: { code: 'UNAUTHORIZED', message } }, 401);

const forbidden = (c, message = 'You do not have permission to perform this action.') =>
  c.json({ error: { code: 'FORBIDDEN', message } }, 403);

/**
 * Validates a Supabase access token, then loads the role from profiles.
 * JWT/user metadata is never treated as the authorization source.
 */
export async function requireAuth(c, next) {
  const header = c.req.header('Authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) return unauthorized(c);

  let supabase;
  try {
    supabase = createUserScopedSupabase(c.env, token);
  } catch {
    return c.json(
      { error: { code: 'AUTH_UNAVAILABLE', message: 'Authentication service is not configured.' } },
      503,
    );
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return unauthorized(c, 'Invalid or expired session.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return forbidden(c, 'The account profile is missing or inactive.');
  }

  c.set('authUser', user);
  c.set('profile', profile);
  await next();
}

export function requireRole(...roles) {
  return async (c, next) => {
    const profile = c.get('profile');
    if (!profile) return unauthorized(c);
    if (!roles.includes(profile.role)) return forbidden(c);
    await next();
  };
}

/**
 * Handles native deep-link intents (custom scheme `lyven://`, universal links).
 *
 * By default we force the app to open at `/` so cold-start notifications and
 * stray links don't land the user on a random screen. Recovery links are the
 * exception: they must pass through untouched so expo-router opens
 * `/reset-password?token_hash=...&type=recovery` (or `?code=...` for PKCE).
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes('reset-password')) {
      // Normalize `lyven://reset-password?query` to `/reset-password?query`
      // so expo-router parses the route AND its query params.
      const withoutScheme = path.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
      return withoutScheme.startsWith('/') ? withoutScheme : `/${withoutScheme}`;
    }
  } catch {
    // fall through to the default below
  }
  return '/';
}

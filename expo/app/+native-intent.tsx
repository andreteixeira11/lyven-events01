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
  initial,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes('reset-password')) {
      return path;
    }
  } catch {
    // fall through to the default below
  }
  return '/';
}

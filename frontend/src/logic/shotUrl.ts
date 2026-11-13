/** Turn a simulator deep link into an expo-router path. */
export function parseShotRoute(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  let path = parsed.pathname || '';
  if (host && host !== 'localhost') {
    path = `/${host}${path === '/' ? '' : path}`;
  }
  if (!path || path === '/') return '/';
  return `${path}${parsed.search}`;
}

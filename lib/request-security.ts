export function hasSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    try {
      const url = new URL(request.url);
      const hostname = url.hostname.toLowerCase();
      return url.protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local'));
    } catch {
      return false;
    }
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

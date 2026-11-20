/**
 * Client-side synchronous check to avoid flashing Host UI on student LAN phones.
 * Always confirmed by server `/api/server-info` (`canAccessHost`).
 */
export function isClientLikelyLocalHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return true;
  }
  // Cloud Run preview sandbox (non-LAN)
  if (host.endsWith('.run.app')) {
    return true;
  }
  // Private LAN IPs (e.g. 192.168.x.x, 10.x.x.x, 172.16-31.x.x) are student devices!
  return false;
}

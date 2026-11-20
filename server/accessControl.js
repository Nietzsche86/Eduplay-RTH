/**
 * Localhost-only access guard for Teacher / Host mode.
 * On a real local teacher laptop (non-Cloud Run), ONLY loopback clients
 * (127.0.0.1, ::1, ::ffff:127.0.0.1, localhost) may access Host routes/sockets.
 * Students joining via LAN IP (e.g. 192.168.x.x:3000) are blocked from Host Mode.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function isLoopbackAddress(address) {
  if (!address) return false;
  const raw = String(address).trim().toLowerCase();
  return (
    raw === '127.0.0.1' ||
    raw === '::1' ||
    raw === '::ffff:127.0.0.1' ||
    raw.startsWith('127.')
  );
}

export function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const clean = String(hostname).split(':')[0].trim().toLowerCase();
  return LOOPBACK_HOSTS.has(clean);
}

export function isPrivateLanIpHost(hostname) {
  if (!hostname) return false;
  const clean = String(hostname).split(':')[0].trim().toLowerCase();
  if (clean.startsWith('192.168.') || clean.startsWith('10.') || clean.startsWith('169.254.')) {
    return true;
  }
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)) {
    return true;
  }
  return false;
}

/**
 * Determines whether an incoming HTTP/Socket client is allowed to use Host Mode.
 * - On local teacher laptop (`isCloudPreview === false`): STRICT loopback check on both host header and remote IP.
 * - On hosted Cloud Run sandbox (`isCloudPreview === true`): allows preview access unless accessed via a private LAN IP.
 */
export function canAccessHostMode({
  remoteAddress,
  hostHeader,
  isCloudPreview = Boolean(process.env.K_SERVICE),
}) {
  const host = String(hostHeader || '').split(':')[0].trim().toLowerCase();

  // Always block private LAN IP hostnames (students opening http://192.168.x.x:3000)
  if (isPrivateLanIpHost(host)) {
    return false;
  }

  // Loopback hostname + loopback socket address is always allowed
  if (isLoopbackHostname(host) && isLoopbackAddress(remoteAddress)) {
    return true;
  }

  // In hosted Cloud Run preview sandbox only, allow preview domain access
  if (isCloudPreview && host.endsWith('.run.app')) {
    return true;
  }

  return false;
}

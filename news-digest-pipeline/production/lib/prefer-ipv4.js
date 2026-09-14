/**
 * Prefer IPv4 DNS on macOS/Node — avoids intermittent ENOTFOUND for api.cloudflare.com.
 */
import dns from 'node:dns';

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

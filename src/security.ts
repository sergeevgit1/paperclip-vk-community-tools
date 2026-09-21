import { isIP } from "node:net";

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
}

const ALLOWED_PORTS = new Set(["", "443", "8443"]);
const ALLOWED_VK_DOMAINS = ["vk.com", "vk.ru", "userapi.com"];

function isPrivateOrLoopbackIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split(".").map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some(Number.isNaN)) {
      return true;
    }
    const [b0, b1] = parts;
    // Loopback 127.0.0.0/8
    if (b0 === 127) return true;
    // 0.0.0.0/8 (current network / broadcast)
    if (b0 === 0) return true;
    // Private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    if (b0 === 10) return true;
    if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;
    if (b0 === 192 && b1 === 168) return true;
    // Link-local / Cloud metadata: 169.254.0.0/16
    if (b0 === 169 && b1 === 254) return true;
    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();
    // Loopback ::1
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") return true;
    // Unspecified ::
    if (normalized === "::" || normalized === "0:0:0:0:0:0:0:0") return true;
    // Link-local fe80::/10
    if (/^fe[89ab]/i.test(normalized)) return true;
    // Unique local fc00::/7 (fc00:: - fdff::)
    if (/^f[cd]/i.test(normalized)) return true;
    // IPv4-mapped IPv6 (::ffff:127.0.0.1, etc.)
    if (normalized.startsWith("::ffff:")) {
      const ipv4Part = normalized.slice(7);
      return isPrivateOrLoopbackIp(ipv4Part);
    }
    return false;
  }

  return false;
}

function parseAndValidateBaseUrl(urlString: string): { parsed?: URL; error?: string } {
  if (typeof urlString !== "string" || !urlString.trim()) {
    return { error: "URL is required" };
  }

  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { error: "Malformed URL" };
  }

  if (parsed.protocol !== "https:") {
    return { error: `Forbidden scheme: ${parsed.protocol} (only https: is allowed)` };
  }

  if (parsed.username || parsed.password) {
    return { error: "Embedded credentials are not allowed" };
  }

  if (!ALLOWED_PORTS.has(parsed.port)) {
    return { error: `Forbidden port: ${parsed.port} (only 443, 8443 or default are allowed)` };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return { error: `Loopback or local host is not allowed: ${hostname}` };
  }

  if (isIP(hostname) && isPrivateOrLoopbackIp(hostname)) {
    return { error: `Private or loopback IP is not allowed: ${hostname}` };
  }

  return { parsed };
}

export function validateUploadUrl(urlString: string): UrlValidationResult {
  const base = parseAndValidateBaseUrl(urlString);
  if (!base.parsed) {
    return { valid: false, reason: base.error };
  }

  const host = base.parsed.hostname.toLowerCase();
  const isAllowedHost = ALLOWED_VK_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));

  if (!isAllowedHost) {
    return { valid: false, reason: `Host ${host} is not an allowed VK upload host` };
  }

  return { valid: true };
}

export function validateExternalFetchUrl(urlString: string): UrlValidationResult {
  const base = parseAndValidateBaseUrl(urlString);
  if (!base.parsed) {
    return { valid: false, reason: base.error };
  }

  return { valid: true };
}

export function sanitizeVkError(errorString: string): string {
  if (typeof errorString !== "string") {
    return "";
  }

  let sanitized = errorString;

  // Redact explicit access_token query/url params
  sanitized = sanitized.replace(/(access_token=)[^&\s"'`]+/gi, "$1[REDACTED]");

  // Redact standard VK API tokens pattern: vk1.a.[A-Za-z0-9_\-\.]{30,}
  sanitized = sanitized.replace(/vk1\.a\.[A-Za-z0-9_\-\.]{30,}/g, "[REDACTED]");

  return sanitized;
}

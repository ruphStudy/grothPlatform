const SECRET_KEY_PATTERN = /(password|secret|token|apikey|api_key|authorization|credential|privatekey|private_key|signature)/i;

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[Redacted:depth]';
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => redactSecrets(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).slice(0, 50).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[Redacted]' : redactSecrets(item, depth + 1),
    ]),
  );
}

export function hashIp(value?: string) {
  if (!value) return undefined;
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ip_${(hash >>> 0).toString(16)}`;
}

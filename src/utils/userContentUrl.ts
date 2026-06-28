const SAFE_ABSOLUTE_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeUserContentUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../") || trimmed.startsWith("#")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (!SAFE_ABSOLUTE_PROTOCOLS.has(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isSafeUserContentUrl(value: string | null | undefined): boolean {
  return normalizeUserContentUrl(value) != null;
}

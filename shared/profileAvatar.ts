export function profileAvatarPath(uid: string): string {
  if (!uid || uid.includes("/")) throw new Error("Invalid profile owner");
  return `profiles/${uid}/avatar`;
}

export function profileAvatarUrl(bucket: string, uid: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(profileAvatarPath(uid))}?alt=media`;
}

export function parseProfileAvatarUrl(url?: string | null): { bucket: string; uid: string } | undefined {
  if (!url) return undefined;
  const match = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/profiles%2F([^/?]+)%2Favatar\?alt=media$/.exec(url);
  if (!match) return undefined;
  try {
    const bucket = decodeURIComponent(match[1]);
    const uid = decodeURIComponent(match[2]);
    if (profileAvatarUrl(bucket, uid) === url) return { bucket, uid };
  } catch {
    // Malformed external URL or an invalid Storage object owner.
  }
  return undefined;
}

/** An explicit null in the saved profile clears the login provider's photo. */
export function resolveProfilePhotoUrl(savedUrl?: string | null, providerUrl?: string | null): string | null {
  return savedUrl === undefined ? providerUrl ?? null : savedUrl;
}

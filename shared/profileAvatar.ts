export function profileAvatarPath(uid: string): string {
  if (!uid || uid.includes("/")) throw new Error("Invalid profile owner");
  return `profiles/${uid}/avatar`;
}

export function profileAvatarUrl(bucket: string, uid: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(profileAvatarPath(uid))}?alt=media`;
}

export function isProfileAvatarUrl(value: unknown, bucket: string, uid: string): boolean {
  return value === profileAvatarUrl(bucket, uid);
}

/** Recognize canonical URLs without including their owner or path in diagnostics. */
export function isCanonicalProfileAvatarUrl(url?: string | null): boolean {
  return typeof url === "string"
    && /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\/profiles%2F[^/?]+%2Favatar\?alt=media$/.test(url);
}

/** An explicit null in the saved profile clears the login provider's photo. */
export function resolveProfilePhotoUrl(savedUrl?: string | null, providerUrl?: string | null): string | null {
  return savedUrl === undefined ? providerUrl ?? null : savedUrl;
}

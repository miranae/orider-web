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

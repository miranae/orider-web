import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

export interface NativePhotoReference { activityId: string; photoId: string }
const id = /^[A-Za-z0-9_-]{1,160}$/;
export function isNativePhotoReference(value: unknown): value is NativePhotoReference {
  if (!value || typeof value !== "object") return false;
  const photo = value as NativePhotoReference;
  return typeof photo.activityId === "string" && id.test(photo.activityId) && typeof photo.photoId === "string" && id.test(photo.photoId);
}
export function isLegacyActivityPhotoUrl(url: string): boolean {
  try { return decodeURIComponent(url).includes("activity_photos/"); } catch { return true; }
}
const connected = new WeakSet<object>();
async function call<T>(services: FirebaseServices, name: string, payload: object): Promise<T> {
  const viewer = services.auth.currentUser;
  await services.ensureAppCheckReady();
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
  if (isEmulatorRuntime() && !connected.has(functions)) {
    connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
    connected.add(functions);
  }
  const result = await httpsCallable<object, T>(functions, name, { timeout: 30000 })(payload);
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  return result.data;
}
export async function loadNativeActivityPhoto(services: FirebaseServices, photo: NativePhotoReference): Promise<Blob> {
  if (!isNativePhotoReference(photo)) throw new Error("invalid_photo");
  const data = await call<{ base64: string; contentType: string }>(services, "getActivityPhotoData", photo);
  if (!["image/webp", "image/jpeg", "image/png"].includes(data.contentType) || typeof data.base64 !== "string"
    || !data.base64.length || data.base64.length > 6990508 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64)) throw new Error("invalid_photo");
  const bytes = Uint8Array.from(atob(data.base64), char => char.charCodeAt(0));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new Error("invalid_photo");
  return new Blob([bytes], { type: data.contentType });
}
export async function uploadNativeActivityPhoto(services: FirebaseServices, photo: NativePhotoReference, blob: Blob, location?: [number, number] | null) {
  const viewer = services.auth.currentUser;
  if (!viewer || viewer.isAnonymous) throw new Error("sign_in_required");
  if (!isNativePhotoReference(photo) || blob.size === 0 || blob.size > 5 * 1024 * 1024) throw new Error("invalid_photo");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("photo_read_failed"));
    reader.readAsDataURL(blob);
  });
  if (services.auth.currentUser !== viewer) throw new Error("account_changed");
  return call<{ photoId: string; nativePhoto: NativePhotoReference }>(services, "uploadActivityPhoto", {
    ...photo, base64, contentType: blob.type, ...(location ? { location: { lat: location[0], lon: location[1] } } : {}),
  });
}

/** Revalidate a currently displayed image without downloading its bytes again. */
export async function authorizeNativeActivityPhoto(services: FirebaseServices, photo: NativePhotoReference): Promise<void> {
  if (!isNativePhotoReference(photo)) throw new Error("invalid_photo");
  const result = await call<{ authorized: boolean }>(services, "getActivityPhotoData", { ...photo, accessOnly: true });
  if (result.authorized !== true) throw new Error("photo_access_unconfirmed");
}

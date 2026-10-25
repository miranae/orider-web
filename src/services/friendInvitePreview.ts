import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseServices } from "../contexts/FirebaseServicesContext";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";
export interface FriendInviteProfile { userId: string; nickname: string; photoURL: string | null }
const connected = new WeakSet<object>();
export async function resolveFriendInvitePreview(services: FirebaseServices, friendCode: string): Promise<FriendInviteProfile | null> {
  const code = friendCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return null;
  const viewer = services.auth.currentUser;
  const current = () => { if (services.auth.currentUser !== viewer) throw Error("account_changed"); };
  await services.ensureAppCheckReady(); current();
  const functions = getRuntimeConfig().appEnvironment === "stage" ? services.functions : getFunctions(services.functions.app, "asia-northeast3");
  if (isEmulatorRuntime() && !connected.has(functions)) {
    connectFunctionsEmulator(functions, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001)); connected.add(functions);
  }
  const { data } = await httpsCallable<{ friendCode: string }, { profile: FriendInviteProfile | null }>(functions, "resolveFriendInvite", { timeout: 10000 })({ friendCode: code });
  current();
  if (!data || !("profile" in data)) throw Error("invalid_friend_invite");
  const profile = data.profile;
  if (profile === null) return null;
  if (!profile || typeof profile.userId !== "string" || !profile.userId || profile.userId.includes("/") || typeof profile.nickname !== "string" || !profile.nickname.trim()
    || profile.nickname.length > 200 || profile.photoURL !== null && (typeof profile.photoURL !== "string" || !/^https:\/\//.test(profile.photoURL))) throw Error("invalid_friend_invite");
  return { userId: profile.userId, nickname: profile.nickname, photoURL: profile.photoURL };
}

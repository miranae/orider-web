import { isEmulatorRuntime } from "../services/runtimeConfig";

// 서버 배포 전에는 운영 빌드에 노출하지 않는다. 로컬 화면과 API 준비를 별도로 확인한다.
export const ACTIVITY_SUBSCRIPTIONS_ENABLED = import.meta.env.DEV && import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED === "true";
export function activitySubscriptionsBackendReady(): boolean {
  return ACTIVITY_SUBSCRIPTIONS_ENABLED && (isEmulatorRuntime() || import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY === "true");
}

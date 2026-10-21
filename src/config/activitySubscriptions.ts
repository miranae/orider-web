import { isEmulatorRuntime } from "../services/runtimeConfig";

// 운영은 서버 readiness 검증 후 두 배포 변수를 명시적으로 켜야 한다.
export const ACTIVITY_SUBSCRIPTIONS_ENABLED = import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_ENABLED === "true";
export function activitySubscriptionsBackendReady(): boolean {
  return ACTIVITY_SUBSCRIPTIONS_ENABLED && (isEmulatorRuntime() || import.meta.env.VITE_ACTIVITY_SUBSCRIPTIONS_BACKEND_READY === "true");
}

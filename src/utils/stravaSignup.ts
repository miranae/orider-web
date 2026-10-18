import { sanitizeInternalReturnPath } from "./internalReturnPath";

/** 신규 가입 안내 자체를 복귀 대상으로 중첩하지 않는다. */
export function stravaSignupReturnTo(value: string | null | undefined): string {
  const safe = sanitizeInternalReturnPath(value);
  const url = new URL(safe, "https://orider.invalid");
  const path = decodeURIComponent(url.pathname).replace(/^\/(ko|en)(?=\/|$)/, "");
  return path === "/settings/connections" && url.searchParams.has("stravaSignup") ? "/" : safe;
}

export function stravaSignupGuidancePath(returnTo: string | null | undefined): string {
  return `/settings/connections?${new URLSearchParams({ stravaSignup: "1", returnTo: stravaSignupReturnTo(returnTo) })}`;
}

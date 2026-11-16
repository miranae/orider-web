/** 모바일 요청 식별자를 브라우저에서 소비하지 않고 앱까지 왕복 보존한다. */
export function stravaMobileCallbackUrl(params: URLSearchParams): string | null {
  const state = params.get("state");
  if (state !== "mobile" && !/^mobile:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state ?? "")) return null;
  const callback = new URL("orider://strava/callback");
  callback.searchParams.set("state", state!);
  const code = params.get("code");
  if (code) {
    callback.searchParams.set("code", code);
    callback.searchParams.set("scope", params.get("scope") || "");
  } else {
    callback.searchParams.set("error", params.get("error") || "denied");
  }
  return callback.toString();
}

export const PUBLIC_CLUB_ENDPOINT = "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs";

/** 공개 경로 설정만 허용한다. 인증·비밀·회원 데이터 경계를 바꾸지 않는다. */
export function publicClubEndpoint(value) {
  if (value === undefined || value === "") return undefined;
  if (value !== PUBLIC_CLUB_ENDPOINT) throw new Error("public club endpoint must match the approved production function");
  return value;
}

export function withPublicClubEndpoint(source, override) {
  const configured = publicClubEndpoint(override || source.publicClubApiUrl);
  return { ...source, ...(configured ? { publicClubApiUrl: configured } : {}) };
}

/** GET으로 제한한 배포 전 점검. 응답 원문·소개 문자열·식별자는 로그하지 않는다. */
export async function verifyPublicClubApi(config, origin, fetcher = fetch) {
  const endpoint = publicClubEndpoint(config.publicClubApiUrl);
  if (!endpoint) throw new Error("public club endpoint is not configured");
  if (!["https://orider.co.kr", "https://orider-dev.web.app"].includes(origin)) throw new Error("unapproved public club origin");
  const response = await fetcher(`${endpoint}?size=1`, {
    method: "GET", credentials: "omit", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { Origin: origin },
  });
  if (!response.ok || response.headers.get("access-control-allow-origin") !== origin
      || !response.headers.get("cache-control")?.includes("no-store")) throw new Error("public club response or CORS/cache boundary not ready");
  const body = await response.json();
  const fields = ["id", "name", "badge", "description", "kind", "sports", "discipline", "city", "approval"];
  if (!body || !Array.isArray(body.clubs) || body.clubs.length > 1
      || Object.keys(body).some(key => !["clubs", "nextCursor"].includes(key))
      || (body.nextCursor !== null && typeof body.nextCursor !== "string")
      || body.clubs.some(club => !club || Object.keys(club).some(key => !fields.includes(key))
        || typeof club.id !== "string" || typeof club.name !== "string" || typeof club.description !== "string"
        || !["auto", "manual"].includes(club.approval))) throw new Error("public club response exceeds the approved DTO");
  return { ok: true, clubCount: body.clubs.length };
}

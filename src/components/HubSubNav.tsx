import { isSportUiEnabled } from "../config/sportFeatures";
import { useLocation } from "react-router-dom";
import { useMobile } from "../hooks/useMobile";
import { useTranslation } from "react-i18next";
import { RouteTabNav } from "./TabNav";
import { getHub, type HubKey } from "../config/navHubs";

/**
 * 허브 서브탭바 — 활성 허브의 서브 경로들을 상단 탭으로 노출 (이슈 #385).
 * 데스크톱·모바일 공통. 서브탭이 2개 이상인 허브에서만 렌더(홈은 미표시).
 *
 * 각 서브탭은 정확 경로 매칭(end)으로 active 판정 — `/explore/courses` 와 `/explore/segments` 처럼
 * 형제 경로가 서로를 prefix 로 오활성화하지 않게 한다.
 */
export default function HubSubNav({ hubKey }: { hubKey: HubKey }) {
  const { t } = useTranslation("common");
  const hub = getHub(hubKey);
  const { search, pathname } = useLocation();
  const isMobile = useMobile();
  const sport = new URLSearchParams(search).get("sport");
  const coachSport = sport === "run" || sport === "tri" || sport === "swim" && isSportUiEnabled(sport) ? sport : "bike";
  const coachQuery = (to: string) => {
    if (hubKey !== "coach") return "";
    const next = new URLSearchParams({ sport: (to === "/coach/plan" || to === "/coach/goals") && coachSport === "tri" ? "bike" : coachSport });
    const date = new URLSearchParams(search).get("day") ?? new URLSearchParams(search).get("date");
    if (to === "/coach/plan" && date) next.set("date", date);
    return `?${next}`;
  };
  if (hub.subs.length <= 1) return null;
  // 모바일 설정 상세는 iOS 내비 막대(‹ 제목)가 위치를 알려 준다 — 하위탭까지 쌓이면 세 겹이 된다
  if (isMobile && /^(\/[a-z]{2})?\/settings\//.test(pathname)) return null;
  return (
    <div className="hub-subnav" style={{ marginBottom: "var(--space-4)" }}>
      <RouteTabNav
        revealActive
        tabs={hub.subs.map((s) => ({
          to: `${s.to}${coachQuery(s.to)}`,
          label: t(s.labelKey),
          activePaths: s.to === "/coach/plan" ? ["/coach/today", "/athlete/me/activities"] : undefined,
          end: true,
        }))}
      />
    </div>
  );
}

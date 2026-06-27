import { useTranslation } from "react-i18next";
import { RouteTabNav } from "./TabNav";
import { getHub, type HubKey } from "../config/navHubs";

/**
 * 허브 서브탭바 — 활성 허브의 서브 경로들을 상단 탭으로 노출 (이슈 #385).
 * 데스크톱·모바일 공통. 서브탭이 2개 이상인 허브에서만 렌더(홈은 미표시).
 *
 * 각 서브탭은 정확 경로 매칭(end)으로 active 판정 — `/courses` 와 `/explore` 처럼
 * 형제 경로가 서로를 prefix 로 오활성화하지 않게 한다.
 */
export default function HubSubNav({ hubKey }: { hubKey: HubKey }) {
  const { t } = useTranslation("common");
  const hub = getHub(hubKey);
  if (hub.subs.length <= 1) return null;
  return (
    <div style={{ marginBottom: "var(--space-4)" }}>
      <RouteTabNav
        tabs={hub.subs.map((s) => ({ to: s.to, label: t(s.labelKey), end: true }))}
      />
    </div>
  );
}

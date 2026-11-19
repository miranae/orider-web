import { useTranslation } from "react-i18next";
import { qualifiedRunRecords } from "../runAnalysisReadiness";
import type { RunEvidence } from "../multisportPerformance";
import { LocalizedLink } from "../../../components/LocalizedLink";
import { buttonClass, Card, Text } from "../../../theme/components";
import { Resolvable } from "../../../components/redesign/states/Resolvable";
import { canOpenOriderApp, openOriderApp } from "../../../utils/openOriderApp";
import { useFirebaseServices } from "../../../contexts/FirebaseServicesContext";

function duration(seconds: number) {
  const value = Math.round(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainder = String(value % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${remainder}` : `${minutes}:${remainder}`;
}
/** 서버 원본 영수증이 있는 기록만 시간으로 표시한다. 구형 저장값을 PB로 인증하지 않는다. */
/**
 * `openInApp`: 웹 코치 분석에서는 '러닝 분석 준비' 제목·설명 없이 두 버튼만 두고, 누르면 앱으로 넘긴다(2026-11-19).
 */
export default function RunRecordsSummary({ evidence, readiness = false, sourceBoard = false, openInApp = false }: { evidence: RunEvidence; readiness?: boolean; sourceBoard?: boolean; openInApp?: boolean }) {
  const { t } = useTranslation("fitness");
  const qualified = qualifiedRunRecords(evidence);
  if (sourceBoard && !readiness && qualified.length === 0) return <div data-testid="K5-4" className="run-records-board__all-link"><LocalizedLink data-testid="K5-4-2" to="/athlete/me/records?sport=run">{t("runRecords.viewAll")}</LocalizedLink></div>;
  // 웹 코치 분석: 준비 상태면 제목·설명 없이 버튼만 남긴다. 버튼은 웹 페이지 대신 앱을 연다.
  const bare = openInApp && readiness;
  // 휴대폰 웹에서는 각 목적지에 맞는 앱 화면을 연다. 앱이 열리지 않으면 원래 웹 페이지로 간다.
  // 데스크톱과 앱 안(임베드)에서는 원래 웹 페이지로 그대로 간다.
  const inApp = useFirebaseServices().scope === "embedded";
  const openInAppClick = (appPath: string) => openInApp && !inApp ? (event: { preventDefault: () => void; currentTarget: { href: string } }) => {
    if (!canOpenOriderApp()) return;
    event.preventDefault();
    openOriderApp(appPath, event.currentTarget.href);
  } : undefined;
  const Shell = bare ? "div" : Card;
  return <Shell data-testid="K5-4">
    {!bare && <Text as="h2" variant="title">{t(readiness ? "runReadiness.title" : "runRecords.title")}</Text>}
    {/* 기록이 부족하다는 문구를 누르면 기록을 들여오는 연결 화면으로 간다(훈련 기준은 아래 버튼). */}
    {readiness && !bare && <Text as="p" variant="body" tone="secondary"><Resolvable resolve={{ to: "/settings/connections" }}>{t("runReadiness.body")}</Resolvable></Text>}
    {!readiness && qualified.length === 0 && <Text as="p" variant="bodySmall" tone="secondary">{t(evidence.unverifiedRecords?.length ? "runRecords.unverified" : "runRecords.none")}</Text>}
    {qualified.length > 0 && (["5km", "10km"] as const).map(distance => {
      const best = qualified.filter(record => record.distance === distance).sort((a, b) => a.seconds - b.seconds)[0];
      const legacy = evidence.unverifiedRecords?.some(record => record.distance === distance);
      return <Text data-testid="K5-4-1" as="p" key={distance}>{t(`runRecords.dist.${distance}`)} · {best ? `${duration(best.seconds)} · ${best.date}` : t(legacy ? "runRecords.unverifiedLabel" : "runRecords.none")}</Text>;
    })}
    {readiness && !sourceBoard && evidence.unverifiedRecords?.length ? <Text as="p" variant="bodySmall" tone="secondary">{t("runRecords.unverified")}</Text> : null}
    <div className="flex flex-wrap items-center gap-2">
    {readiness && <LocalizedLink className={buttonClass({ variant: "primary" })} to="/coach/condition?sport=run#thresholds" onClick={openInAppClick("coach/run-thresholds")}>{t("runReadiness.setThresholds")}</LocalizedLink>}
    <LocalizedLink className={readiness ? buttonClass({ variant: "outline" }) : undefined} data-testid="K5-4-2" to="/athlete/me/records?sport=run" onClick={openInAppClick("records/run")}>{t("runRecords.viewAll")}</LocalizedLink>
    </div>
  </Shell>;
}

/**
 * AI 라이딩 분석 카드 (활동 개요).
 *
 * 요약(항상) + 컴팩트 타임라인 바(존 색·기온) + 구간별 코칭(접기/펼치기, 기본 펼침).
 * 비용 들인 LLM 결과를 첫 화면에 노출 — 세부 탭에 숨기지 않는다.
 *
 * 설계: docs/architecture/RIDE_SEGMENT_NARRATIVE.md
 */
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, Text, Button } from "../../theme/components";

/** 구간당 메달(🏅/🏆) 기본 노출 상한 — 한 구간이 수십 개 세그먼트에 매칭되면 메달 벽이 생겨 가독성 저하. */
const MEDAL_LIMIT = 5;
import { useActivityNarrative, type NarrativeSegment, type Prescription, type NarrativeLang } from "../../hooks/useActivityNarrative";
import { useActivityNarrativePeek, invalidateActivityNarrativePeekCache } from "../../hooks/useActivityNarrativePeek";
import { useAuth } from "../../contexts/AuthContext";

const TERRAIN_ICON: Record<string, string> = { climb: "🔼", descent: "🔽", flat: "➡️" };

/** i18n.language → 서버 슬롯 언어. en* → en, 그 외 → ko. */
function narrativeLangFrom(i18nLang: string | undefined): NarrativeLang {
  return i18nLang?.startsWith("en") ? "en" : "ko";
}

function zoneNum(zone: string | null): number {
  return zone ? Number(zone.replace("Z", "")) || 0 : 0;
}

function zoneVar(zone: string | null): string {
  const n = zoneNum(zone);
  return n >= 1 && n <= 5 ? `var(--zone-${n})` : "var(--line-soft)";
}

function FlagChip({ flag, t }: { flag: string; t: (key: string) => string }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)]"
      style={{ background: "color-mix(in srgb, var(--lime) 12%, transparent)", color: "var(--lime)" }}
    >
      {t(`ai.flag.${flag}`) !== `ai.flag.${flag}` ? t(`ai.flag.${flag}`) : flag}
    </span>
  );
}

/** 코치 처방 블록 — 진단(구간) 뒤에 오는 "그래서 다음엔" 행동 권고. 결정적 산출(LLM 미경유). */
function PrescriptionBlock({ items, t }: { items: Prescription[]; t: (key: string) => string }) {
  return (
    <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.prescription")}</span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((p, i) => (
          <div
            key={`${p.theme}-${i}`}
            className="flex flex-col gap-0.5 p-3 rounded-[var(--r-lg)]"
            style={{ background: "color-mix(in srgb, var(--lime) 8%, transparent)" }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{p.title}</span>
              {p.horizon === "week" && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-sm)]"
                  style={{ background: "var(--line-soft)", color: "var(--ink-3)" }}
                >
                  {t("ai.thisWeek")}
                </span>
              )}
            </div>
            <Text variant="body" tone="secondary" as="p">{p.detail}</Text>
          </div>
        ))}
      </div>
    </div>
  );
}

function SegmentRow({ seg, t }: { seg: NarrativeSegment; t: (key: string, opts?: Record<string, unknown>) => string }) {
  const [showAllEfforts, setShowAllEfforts] = useState(false);
  // 메달이 상한을 넘으면 의미 있는 것부터 노출되도록 우선순위 정렬:
  // PR(🏆) > KOM/PR 순위 보유 > 시도 이력 보유 > 일반 매칭. 동점은 원래 순서 유지(안정 정렬).
  const sortedEfforts = useMemo(() => {
    const score = (e: NarrativeSegment["efforts"][number]) =>
      (e.isPR ? 4 : 0) +
      (e.komRank != null ? 2 : 0) +
      (e.prRank != null ? 2 : 0) +
      (e.attemptNo != null ? 1 : 0);
    return seg.efforts.map((e, i) => ({ e, i }))
      .sort((a, b) => score(b.e) - score(a.e) || a.i - b.i)
      .map((x) => x.e);
  }, [seg.efforts]);
  const overLimit = sortedEfforts.length > MEDAL_LIMIT;
  const visibleEfforts = showAllEfforts ? sortedEfforts : sortedEfforts.slice(0, MEDAL_LIMIT);

  return (
    <div className="flex flex-col gap-1 py-3" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
        <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>
          {TERRAIN_ICON[seg.terrain]} {seg.fromKm}–{seg.toKm}km
        </span>
        {seg.zone && (
          <span
            className="inline-flex items-center px-1.5 py-0.5 text-[length:var(--fs-xs)] font-bold rounded-[var(--r-sm)]"
            style={{ background: zoneVar(seg.zone), color: "var(--bg-0)" }}
          >
            {seg.zone}
          </span>
        )}
        <Text variant="caption" tone="tertiary" mono>
          {seg.avgSpeedKmh}km/h · {seg.avgPowerW}W · HR{seg.avgHr}
          {seg.avgTempC != null ? ` · ${seg.avgTempC}°` : ""} · {t(`ai.wind.${seg.relWind}`)}
        </Text>
      </div>
      {seg.flags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {seg.flags.map((f) => <FlagChip key={f} flag={f} t={t} />)}
        </div>
      )}
      {seg.efforts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visibleEfforts.map((e) => {
            const rank = [
              e.komRank != null ? t("ai.effort.komRank", { n: e.komRank }) : "",
              e.prRank != null ? t("ai.effort.prRank", { n: e.prRank }) : "",
            ].filter(Boolean).join(" · ");
            // 이력: N번째 · 개인최고 대비
            let hist = "";
            if (e.attemptNo != null) {
              const parts = [t("ai.effort.attemptNo", { n: e.attemptNo })];
              if (e.deltaVsBestSec != null) {
                if (e.deltaVsBestSec < 0) parts.push(t("ai.effort.bestUnder", { n: -e.deltaVsBestSec }));
                else if (e.deltaVsBestSec > 0) parts.push(t("ai.effort.overBest", { n: e.deltaVsBestSec }));
                else parts.push(t("ai.effort.tie"));
              } else parts.push(t("ai.effort.firstRecord"));
              hist = parts.join(" · ");
            }
            return (
              <span
                key={e.name}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)]"
                style={{ background: "color-mix(in srgb, var(--zone-4) 18%, transparent)", color: "var(--ink-1)" }}
              >
                {e.isPR ? "🏆" : "🏅"} {e.name}{rank ? ` · ${rank}` : ""}{hist ? ` · ${hist}` : ""}
              </span>
            );
          })}
          {overLimit && (
            <button
              type="button"
              onClick={() => setShowAllEfforts((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[length:var(--fs-xs)] font-medium rounded-[var(--r-lg)]"
              style={{ background: "var(--bg-2)", color: "var(--ink-3)", border: "1px solid var(--line-soft)", cursor: "pointer" }}
            >
              {showAllEfforts ? t("ai.effort.collapse") : t("ai.effort.more", { count: sortedEfforts.length - MEDAL_LIMIT })}
            </button>
          )}
        </div>
      )}
      {seg.narrative && (
        <Text variant="body" tone="secondary" as="p">{seg.narrative}</Text>
      )}
    </div>
  );
}

interface Props {
  activityId: string | null;
  /** 사이클 활동 + 스트림 준비 시에만 호출 */
  enabled: boolean;
}

export default function AiRideAnalysisCard({ activityId, enabled }: Props) {
  const { t, i18n } = useTranslation("activity");
  const lang = narrativeLangFrom(i18n.language);
  const { user, signInWithGoogle } = useAuth();
  // 1단계: 캐시 peek (LLM 호출 없이 빠른 확인).
  //   공개(everyone) 활동의 캐시 조회는 비로그인도 허용(CF getActivityNarrative cacheOnly) →
  //   이미 생성된 분석은 로그아웃 상태에서도 hit 으로 표시된다. 언어별 슬롯 조회.
  const peek = useActivityNarrativePeek(activityId, enabled, lang);
  // 2단계: 사용자가 "분석시작"을 눌렀을 때만 full 생성 호출.
  //   생성(LLM)은 인증 필수 → 비로그인은 호출 금지. cacheMiss 분기에서 비로그인엔 로그인 CTA 노출
  //   (= 결과는 공개로 보되, 새 생성은 로그인 필요).
  const [triggerFull, setTriggerFull] = useState(false);
  const full = useActivityNarrative(activityId, enabled && triggerFull && !!user, lang);
  const [expanded, setExpanded] = useState(true);
  const retryFullAnalysis = () => {
    if (activityId) invalidateActivityNarrativePeekCache(activityId, lang);
    setTriggerFull(false);
    window.setTimeout(() => setTriggerFull(true), 0);
  };

  if (!enabled) return null;

  // peek 로딩 중 (첫 열람, 빠름)
  if (peek.loading) {
    return (
      <Card padding="none" style={{ padding: "var(--space-5)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.header")}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t("ai.checking")}
        </div>
      </Card>
    );
  }

  // peek miss: 아직 분석 없음 → "분석시작" 버튼 또는 생성 중 스피너.
  // 비로그인: AI 분석 CF 는 인증 필수라 호출하면 카드가 사라진다 → 버튼 대신 로그인 CTA.
  if (peek.cacheMiss && !triggerFull && !full.data) {
    return (
      <Card padding="none" style={{ padding: "var(--space-5)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.header")}</span>
          {user ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (activityId) invalidateActivityNarrativePeekCache(activityId, lang);
                setTriggerFull(true);
              }}
            >
              {t("ai.startBtn")}
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => signInWithGoogle()}>
              {t("ai.loginBtn")}
            </Button>
          )}
        </div>
        <Text variant="caption" tone="tertiary" as="p" className="mt-2">
          {user
            ? t("ai.waitHint")
            : t("ai.loginHint")}
        </Text>
      </Card>
    );
  }

  // full 생성 중 (버튼 클릭 후)
  if (triggerFull && full.loading) {
    return (
      <Card padding="none" style={{ padding: "var(--space-5)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.header")}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[length:var(--fs-sm)]" style={{ color: "var(--ink-3)" }}>
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t("ai.analyzing")}
        </div>
      </Card>
    );
  }

  // 사용할 데이터: peek hit 결과 또는 full 생성 결과
  const data = peek.data ?? full.data;
  const error = full.error;

  if (error) {
    return (
      <Card padding="none" style={{ padding: "var(--space-5)" }}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.header")}</span>
          <Button size="sm" variant="secondary" onClick={retryFullAnalysis}>
            {t("ai.retryBtn")}
          </Button>
        </div>
        <Text variant="caption" tone="danger" as="p" className="mt-2">
          {t("ai.errorPrefix", { error })}
        </Text>
      </Card>
    );
  }

  // 코칭은 부가 기능 — 미생성/빈 결과는 조용히 숨김 (개요 다른 카드 정상 노출)
  if (!data || data.segments.length === 0) return null;

  const { overall } = data;
  const tempBadge =
    overall.tempStartC != null && overall.tempEndC != null
      ? `🌡️ ${overall.tempStartC}→${overall.tempEndC}° (${overall.tempSource === "device" ? t("ai.temp.device") : t("ai.temp.forecast")})`
      : null;
  const totalKm = overall.totalDistanceKm;

  return (
    <Card padding="none" style={{ padding: "var(--space-5)" }}>
      {/* 헤더 */}
      <div className="flex items-center flex-wrap gap-2 mb-3">
        <span className="text-[length:var(--fs-sm)] font-semibold" style={{ color: "var(--ink-1)" }}>{t("ai.header")}</span>
        {tempBadge && <Text variant="caption" tone="tertiary">{tempBadge}</Text>}
        {data.isVirtualPower && <Text variant="caption" tone="tertiary">{t("ai.virtualPower")}</Text>}
      </div>

      {/* 요약 (항상 노출) */}
      <Text variant="body" tone="primary" as="p">{data.summary}</Text>

      {/* 전체 플래그 */}
      {overall.flags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {overall.flags.map((f) => <FlagChip key={f} flag={f} t={t} />)}
        </div>
      )}

      {/* 컴팩트 타임라인 바 (존 색, 거리 비례) */}
      <div className="flex w-full mt-4 rounded-[var(--r-sm)] overflow-hidden" style={{ height: "10px" }}>
        {data.segments.map((s) => (
          <div
            key={`${s.fromKm}-${s.toKm}`}
            title={`${s.fromKm}–${s.toKm}km ${s.zone ?? ""} ${s.avgTempC != null ? s.avgTempC + "°" : ""}`}
            style={{ flexGrow: Math.max(0.001, s.toKm - s.fromKm), background: zoneVar(s.zone) }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1">
        <Text variant="caption" tone="tertiary" mono>0km</Text>
        <Text variant="caption" tone="tertiary" mono>{totalKm}km</Text>
      </div>

      {/* 구간별 코칭 (접기/펼치기, 기본 펼침) */}
      <div className="flex items-center justify-between mt-4">
        <Text variant="eyebrow" tone="tertiary">{t("ai.segmentAnalysis", { count: data.segments.length })}</Text>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? t("ai.collapse") : t("ai.expand")}
        </Button>
      </div>
      {expanded && (
        <div className="mt-1">
          {data.segments.map((s) => <SegmentRow key={`${s.fromKm}-${s.toKm}`} seg={s} t={t} />)}
        </div>
      )}

      {/* 코치 처방 (진단 뒤 행동 권고). 구버전 캐시(rsn-v9)는 미포함 → 조용히 숨김 */}
      {data.prescriptions && data.prescriptions.length > 0 && (
        <PrescriptionBlock items={data.prescriptions} t={t} />
      )}
    </Card>
  );
}

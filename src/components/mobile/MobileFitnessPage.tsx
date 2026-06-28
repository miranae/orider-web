/**
 * 모바일 피트니스 페이지.
 *
 * 개요 탭: PMC 링 + 60일 PMC 추이 + 주간 TSS(4주) + 최근 활동
 * 분석 탭(종목별):
 *   - bike: FTP + 파워존 분포(스트림 기반) + 파워 커브 + 존 정의
 *   - run:  임계 페이스 + HR 존 분포 + 존 정의
 *   - swim: CSS + (HR 존 분포 가능 시)
 *
 * 모든 데이터는 FitnessPage 가 미리 계산해 props 로 전달.
 */
import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { LocalizedLink as Link } from "../LocalizedLink";
import { useLocalizedNavigate as useNavigate } from "../../hooks/useLocalizedNavigate";
import { ChevronLeft } from "lucide-react";
import SportFilterTabs from "./SportFilterTabs";
import { getDisciplineColor, getDisciplineIcon, getDisciplineLabelKey } from "../../utils/disciplineFilter";
import type { Discipline } from "../../utils/disciplineFilter";
import { Text } from "../../theme/components";

export type ZoneSource = "power" | "hr" | "none";

export interface MobileFitnessZone {
  name: string;
  pct: number;
  color: string;
  rangeLabel: string;     // "< 110 W" 또는 "60–70% maxHR"
  percentLabel: string;   // "~55%" / "60–70%"
}

export interface MobileRecentActivity {
  id: string;
  title: string;
  dateLabel: string;
  tss?: number;
  distanceKm?: number;
  durationMin?: number;
}

export interface MobilePowerCurvePoint {
  durationSeconds: number;
  maxPower: number;
}

export interface MobileFitnessPmcPoint { ctl: number; atl: number; tsb: number; date?: string; /* YYYY-MM-DD */ }
export interface MobileFitnessProjPoint { date: number; ctl: number; atl: number; tsb: number; /* ms timestamp */ }

export interface MobileFitnessThreshold {
  label: string;     // "FTP" / "임계 페이스" / "CSS"
  value: string;     // "245" / "4:25" / "1:35"
  unit: string;      // "W" / "/km" / "/100m"
  sub: string;       // 부연
}

export interface MobileFitnessData {
  // PMC
  ctl: number; atl: number; tsb: number;
  pmcHistory: MobileFitnessPmcPoint[];  // 오래된 → 최신
  pmcProjection?: MobileFitnessProjPoint[] | null;  // 미래 예측 (있을 때만)
  today?: string;                       // YYYY-MM-DD (오늘 마커용)
  // 주간 TSS
  weeklyTSS: number[];   // 오래된 → 최신 (최근 4주)
  thisWeekTSS: number;
  avgWeekTSS: number;
  restDays: number;
  // 임계값 (종목별)
  threshold: MobileFitnessThreshold | null;
  // VO2max 추정용 (bike 한정). FTP/체중 → KPI 표에서 VO2max 셀 노출.
  ftp?: number;
  weightKg?: number;
  // 최근 활동
  recentActivities: MobileRecentActivity[];
  // 존 분포
  zones: MobileFitnessZone[];
  zoneSource: ZoneSource;
  // 파워 커브 (bike, 있을 때만)
  powerCurve?: MobilePowerCurvePoint[];
  // 디스플레이용 종목 키 (탭 라벨/색상 결정)
  discipline: "bike" | "run" | "swim" | "tri";
}

/** TSB 가독성 라벨 키 (데스크탑 FitnessPage 와 동일 톤). */
function tsbLabelKey(tsb: number): string {
  if (tsb >= 25) return "mobileFitness.tsbOverRested";
  if (tsb >= 5) return "mobileFitness.tsbOptimalForm";
  if (tsb >= -10) return "mobileFitness.tsbTrainingOk";
  if (tsb >= -20) return "mobileFitness.tsbFatigue";
  return "mobileFitness.tsbOverload";
}

/** VO2max 추정: FTP / 체중(kg) × 15.7 + 3.5 (FitnessPage.tsx 와 동일 공식). */
function estimateVo2max(ftp: number | undefined, weightKg: number | undefined): number | null {
  if (!ftp || ftp <= 0) return null;
  const w = weightKg && weightKg > 0 ? weightKg : 70;
  return Math.round((ftp / w) * 15.7 + 3.5);
}

// ── PMC 추이 미니 차트 (Y축·X축 라벨, 오늘 마커, 예측, 탭 툴팁) ──
function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const step0 = range / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

function formatMd(dateStr?: string): string {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  return m && d ? `${parseInt(m)}/${parseInt(d)}` : dateStr;
}

function PmcMiniChart({ history, projection, today, color, t }: {
  history: MobileFitnessPmcPoint[];
  projection?: MobileFitnessProjPoint[] | null;
  today?: string;
  color: string;
  t: (key: string) => string;
}) {
  const [tapIdx, setTapIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (history.length < 2) {
    return (
      <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-4)", fontSize: "var(--fs-xs)" }}>
        {t("mobileFitness.pmcNoData")}
      </div>
    );
  }

  // 캔버스 + 여백
  const W = 360, H = 210;
  const PAD_L = 26, PAD_R = 8, PAD_T = 10, PAD_B = 22;
  const PLOT_W = W - PAD_L - PAD_R, PLOT_H = H - PAD_T - PAD_B;

  // 과거 + 미래 시계열 정합 (FitnessChart 의 seed offset 동작 포팅)
  const pastCTL = history.map(p => p.ctl);
  const pastATL = history.map(p => p.atl);
  const pastTSB = history.map(p => p.tsb);
  const pastDates = history.map(p => p.date ?? "");

  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  const lastPastDate = pastDates[pastDates.length - 1] ?? "";

  // 예측: 오늘 이후로 필터, 첫 점이 과거 마지막과 어긋나면 평행이동.
  const tsToDateStr = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const fut = (projection ?? []).filter(p => tsToDateStr(p.date) > lastPastDate);
  const hasFut = fut.length > 0;
  const ctlOff = hasFut ? (pastCTL[pastCTL.length - 1] ?? 0) - fut[0]!.ctl : 0;
  const atlOff = hasFut ? (pastATL[pastATL.length - 1] ?? 0) - fut[0]!.atl : 0;
  const tsbOff = hasFut ? (pastTSB[pastTSB.length - 1] ?? 0) - fut[0]!.tsb : 0;

  const allCTL = [...pastCTL, ...fut.map(p => p.ctl + ctlOff)];
  const allATL = [...pastATL, ...fut.map(p => p.atl + atlOff)];
  const allTSB = [...pastTSB, ...fut.map(p => p.tsb + tsbOff)];
  const allDates = [...pastDates, ...fut.map(p => tsToDateStr(p.date))];
  const pastCount = pastCTL.length;
  const total = allCTL.length;

  // Y 스케일 (자동 + 패딩)
  const all = [...allCTL, ...allATL, ...allTSB];
  const dataMax = Math.max(...all, 10);
  const dataMin = Math.min(...all, -5);
  const pad = (dataMax - dataMin) * 0.1;
  const yMax = dataMax + pad, yMin = dataMin - pad;

  const sx = (i: number) => PAD_L + (i / Math.max(1, total - 1)) * PLOT_W;
  const sy = (v: number) => PAD_T + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;
  const zeroY = sy(0);

  const lineSeg = (arr: number[], from: number, count: number) =>
    arr.slice(from, from + count).map((v, i) => `${i ? "L" : "M"}${sx(from + i).toFixed(1)} ${sy(v).toFixed(1)}`).join(" ");

  const ctlPast = lineSeg(allCTL, 0, pastCount);
  const atlPast = lineSeg(allATL, 0, pastCount);
  const tsbPast = lineSeg(allTSB, 0, pastCount);
  const ctlFut = hasFut ? lineSeg(allCTL, pastCount - 1, fut.length + 1) : "";
  const atlFut = hasFut ? lineSeg(allATL, pastCount - 1, fut.length + 1) : "";
  const tsbFut = hasFut ? lineSeg(allTSB, pastCount - 1, fut.length + 1) : "";
  const ctlFill = `M${sx(0).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} ${ctlPast.replace(/^M/, "L")} L${sx(pastCount - 1).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // 오늘 마커 + 예측 영역
  const todayIdx = pastCount - 1;
  const todayX = sx(todayIdx);
  const todayCtlY = sy(pastCTL[pastCount - 1] ?? 0);

  // Y 눈금
  const yTicks = niceTicks(yMin, yMax, 4);

  // X 날짜 라벨 (3개: 시작/중간/끝)
  const labelIdx = [0, Math.floor(total / 2), total - 1].filter((v, i, a) => a.indexOf(v) === i && v >= 0 && v < total);
  const xLabels = labelIdx.map(idx => ({ x: sx(idx), text: formatMd(allDates[idx]), isToday: allDates[idx] === todayStr }));

  // 탭 툴팁 처리
  const handleTap = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current; if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const px = ratio * W;
    // 가장 가까운 인덱스
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < total; i++) {
      const dx = Math.abs(sx(i) - px);
      if (dx < bestDist) { bestDist = dx; best = i; }
    }
    setTapIdx(best);
  };

  const tip = tapIdx != null ? {
    x: sx(tapIdx), date: allDates[tapIdx], ctl: allCTL[tapIdx]!, atl: allATL[tapIdx]!, tsb: allTSB[tapIdx]!,
    isFuture: tapIdx >= pastCount,
  } : null;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 210, display: "block", touchAction: "manipulation" }}
      preserveAspectRatio="none"
      onPointerDown={handleTap} onPointerMove={(e) => { if (e.buttons & 1) handleTap(e); }} onPointerLeave={() => setTapIdx(null)}>
      <defs>
        <linearGradient id="mobPmcCtlFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <pattern id="mobPmcFutHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-3)" strokeOpacity="0.10" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Y 눈금 + 라벨 */}
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={sy(v)} y2={sy(v)} stroke="var(--line-soft)" strokeOpacity="0.5" />
          <text x={PAD_L - 4} y={sy(v) + 3} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-4)" textAnchor="end">{Math.round(v)}</text>
        </g>
      ))}
      {/* TSB 0 기준선 */}
      {zeroY > PAD_T && zeroY < PAD_T + PLOT_H && (
        <line x1={PAD_L} x2={W - PAD_R} y1={zeroY} y2={zeroY} stroke="var(--ink-3)" strokeDasharray="3 3" opacity="0.4" />
      )}

      {/* 예측 영역(해치) */}
      {hasFut && (
        <rect x={todayX} y={PAD_T} width={W - PAD_R - todayX} height={PLOT_H} fill="url(#mobPmcFutHatch)" />
      )}

      {/* CTL 영역 채움 (과거만) */}
      <path d={ctlFill} fill="url(#mobPmcCtlFill)" />

      {/* TSB → ATL → CTL (zorder: CTL 가장 위) */}
      <path d={tsbPast} stroke="var(--amber)" strokeWidth="1.2" fill="none" opacity="0.75" />
      <path d={atlPast} stroke="var(--rose)" strokeWidth="1.2" fill="none" opacity="0.7" />
      <path d={ctlPast} stroke={color} strokeWidth="1.8" fill="none" />
      {hasFut && (
        <>
          <path d={tsbFut} stroke="var(--amber)" strokeWidth="1.2" fill="none" opacity="0.6" strokeDasharray="3 3" />
          <path d={atlFut} stroke="var(--rose)" strokeWidth="1.2" fill="none" opacity="0.55" strokeDasharray="3 3" />
          <path d={ctlFut} stroke={color} strokeWidth="1.6" fill="none" opacity="0.85" strokeDasharray="4 3" />
        </>
      )}

      {/* 오늘 마커 */}
      <line x1={todayX} x2={todayX} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="var(--ink-2)" strokeDasharray="2 2" opacity="0.55" />
      <circle cx={todayX} cy={todayCtlY} r="3.5" fill={color} stroke="var(--bg-0)" strokeWidth="1.5" />

      {/* X 날짜 라벨 */}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 6} fontSize="9" fontFamily="var(--font-mono)"
          fill={l.isToday ? "var(--ink-1)" : "var(--ink-4)"} textAnchor={i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle"}>
          {l.text}{l.isToday ? t("mobileFitness.pmcLabelToday") : ""}
        </text>
      ))}

      {/* 탭 툴팁 */}
      {tip && (
        <g>
          <line x1={tip.x} x2={tip.x} y1={PAD_T} y2={PAD_T + PLOT_H} stroke="var(--ink-1)" strokeWidth="1" opacity="0.7" />
          {(() => {
            const boxW = 96, boxH = 50;
            const bx = Math.max(PAD_L, Math.min(W - PAD_R - boxW, tip.x + 6));
            const by = PAD_T + 2;
            return (
              <g>
                <rect x={bx} y={by} width={boxW} height={boxH} rx="4" fill="var(--bg-2)" stroke="var(--line-soft)" />
                <text x={bx + 6} y={by + 12} fontSize="9" fontFamily="var(--font-mono)" fill="var(--ink-3)">
                  {formatMd(tip.date)}{tip.isFuture ? t("mobileFitness.pmcLabelForecast") : ""}
                </text>
                <text x={bx + 6} y={by + 24} fontSize="10" fontFamily="var(--font-mono)" fill={color}>CTL {tip.ctl.toFixed(0)}</text>
                <text x={bx + 6} y={by + 35} fontSize="10" fontFamily="var(--font-mono)" fill="var(--rose)">ATL {tip.atl.toFixed(0)}</text>
                <text x={bx + 6} y={by + 46} fontSize="10" fontFamily="var(--font-mono)" fill="var(--amber)">TSB {tip.tsb >= 0 ? "+" : ""}{tip.tsb.toFixed(0)}</text>
              </g>
            );
          })()}
        </g>
      )}
    </svg>
  );
}

// ── 주간 TSS 막대 ──────────────────────────────────────────────
function WeeklyTssBars({ values, color, t }: { values: number[]; color: string; t: (key: string) => string }) {
  const max = Math.max(1, ...values);
  const labels = ["−3", "−2", "−1", t("mobileFitness.weeklyTssThisWeek")];
  // 탭으로 선택된 막대 강조. -1 = 기본(이번 주만 강조).
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const activeIdx = selectedIdx >= 0 ? selectedIdx : values.length - 1;

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(values.length, 1)}, 1fr)`, gap: "var(--space-2)", alignItems: "end" }}>
      {values.map((v, i) => {
        const h = Math.round((v / max) * 70);
        const isActive = i === activeIdx;
        return (
          <button
            key={i}
            type="button"
            aria-label={`${labels[i] ?? ""} ${Math.round(v)} TSS`}
            title={`${labels[i] ?? ""} · ${Math.round(v)} TSS`}
            onClick={() => setSelectedIdx((s) => (s === i ? -1 : i))}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-1)",
              // 디자인 시스템 className 차단 룰 회피 + iOS button 기본 스타일/탭 하이라이트 reset.
              background: "transparent", border: 0, padding: 0, cursor: "pointer",
              color: "inherit", font: "inherit",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <div className="text-[length:var(--fs-xs)]" style={{ fontFamily: "var(--font-mono)", color: isActive ? "var(--ink-0)" : "var(--ink-2)", fontWeight: isActive ? 600 : 400 }}>{Math.round(v)}</div>
            <div style={{ width: "100%", height: 70, display: "flex", alignItems: "end" }}>
              {/* borderRadius 3px: --r-sm(4px) 보다 작은 미니 막대 전용 — 토큰 없음, 시각 동일 위해 리터럴 유지 */}
              <div style={{ width: "100%", height: `${h}px`, minHeight: v > 0 ? 4 : 0, background: isActive ? color : "var(--bg-3)", borderRadius: "3px", transition: "background 0.15s, height 0.2s" }} />
            </div>
            <div className="text-[10px]" style={{ color: isActive ? "var(--ink-2)" : "var(--ink-4)", fontWeight: isActive ? 600 : 400 }}>{labels[i] ?? ""}</div>
          </button>
        );
      })}
    </div>
  );
}

// ── 파워 커브 미니 ─────────────────────────────────────────────
function PowerCurveMini({ points, color }: { points: MobilePowerCurvePoint[]; color: string }) {
  if (!points || points.length < 2) return null;
  const w = 340, h = 150, padX = 28, padY = 10;
  const xMin = Math.log10(Math.max(1, points[0]!.durationSeconds));
  const xMax = Math.log10(points[points.length - 1]!.durationSeconds);
  const yMax = Math.max(...points.map(p => p.maxPower)) * 1.05;
  const sx = (d: number) => padX + ((w - padX * 2) * (Math.log10(Math.max(1, d)) - xMin)) / Math.max(0.0001, xMax - xMin);
  const sy = (p: number) => padY + (h - padY * 2) * (1 - p / Math.max(1, yMax));
  const linePath = points.map((p, i) => `${i ? "L" : "M"}${sx(p.durationSeconds).toFixed(1)} ${sy(p.maxPower).toFixed(1)}`).join(" ");
  const fillPath = `${linePath} L${sx(points[points.length - 1]!.durationSeconds).toFixed(1)} ${h} L${sx(points[0]!.durationSeconds).toFixed(1)} ${h} Z`;
  const ticks = [5, 60, 300, 1200];
  const tickLabels: Record<number, string> = { 5: "5s", 60: "1m", 300: "5m", 1200: "20m" };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", height: 150, display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="mobPcFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.filter(t => t >= points[0]!.durationSeconds && t <= points[points.length - 1]!.durationSeconds).map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={padY} y2={h - padY} stroke="var(--line-soft)" strokeDasharray="2 3" />
          <text x={sx(t)} y={h - 1} fontSize="9" fill="var(--ink-4)" fontFamily="var(--font-mono)" textAnchor="middle">{tickLabels[t]}</text>
        </g>
      ))}
      <path d={fillPath} fill="url(#mobPcFill)" />
      <path d={linePath} stroke={color} strokeWidth="1.8" fill="none" />
      {[5, 60, 300, 1200].map(t => {
        const p = points.find(p => p.durationSeconds === t);
        if (!p) return null;
        return <circle key={t} cx={sx(p.durationSeconds)} cy={sy(p.maxPower)} r="3" fill={color} />;
      })}
      <text x={4} y={padY + 4} fontSize="9" fill="var(--ink-4)" fontFamily="var(--font-mono)">{Math.round(yMax)} W</text>
    </svg>
  );
}

// ── 카드 컨테이너 ─────────────────────────────────────────────
function SectionCard({ children, title, sub }: { children: React.ReactNode; title?: string; sub?: string }) {
  // 모바일은 화면이 좁아 모든 카드를 화면 전폭으로 쓴다(섹션 스타일). Layout 컨텐츠 래퍼
  // (max-w mx-auto px-4 = 좌우 16px) 인셋을 음수 마진(-16)으로 상쇄해 좌우 끝까지 채우고,
  // 좌우 border·radius 는 제거하고 상하 구분선만 둔다. 콘텐츠는 좌우 16px padding 으로 가독성 유지.
  return (
    <div style={{
      margin: "0 -16px 12px",
      background: "var(--bg-1)",
      borderTop: "1px solid var(--line-soft)",
      borderBottom: "1px solid var(--line-soft)",
      padding: "12px 16px",
    }}>
      {(title || sub) && (
        <div style={{ marginBottom: 10 }}>
          {title && <Text variant="eyebrow">{title}</Text>}
          {sub && <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 3 }}>{sub}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────
export default function MobileFitnessPage({ data }: { data: MobileFitnessData }) {
  const { t } = useTranslation("dashboard");
  const [tab, setTab] = useState<"overview" | "analysis">("overview");
  // sportSegment 는 URL ?sport= 와 양방향 바인딩 — 탭 클릭 시 URL 갱신 →
  // FitnessPage 가 discipline 별 데이터(PMC/존/임계값/최근활동/파워커브)를 재계산해
  // props 로 다시 흘려준다. URL 동기화 없이 로컬 state 만 바꾸면 데이터가 안 바뀌어
  // "탭 눌러도 화면이 그대로" 회귀가 발생한다.
  const [searchParams, setSearchParams] = useSearchParams();
  // 화면 표시용 — URL "tri" 는 탭 "all" 로, 없으면 URL 기본인 bike 와 정합.
  const urlSport = searchParams.get("sport") ?? "bike";
  const sportSegment = urlSport === "tri" ? "all" : urlSport;
  const setSportSegment = (v: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("sport", v === "all" ? "tri" : v);
    setSearchParams(next, { replace: true });
  };
  const navigate = useNavigate();

  const ringColor = data.discipline === "bike"
    ? getDisciplineColor("bike")
    : getDisciplineColor(data.discipline as Discipline);

  const analysisTabLabel = data.discipline === "bike"
    ? t("mobileFitness.tabZonesBike")
    : data.discipline === "run"
    ? t("mobileFitness.tabZonesRun")
    : t("mobileFitness.tabZonesSwim");

  const vo2 = estimateVo2max(data.ftp, data.weightKg);
  // 각 KPI desc 는 그 지표 자체를 설명. 이전엔 "피로 우세" 처럼 전체 상태(TSB)를 CTL
  // 하단에 노출해 "CTL=피로?" 오해를 일으켰음. 신뢰성을 위해 TSB 카드에만 종합 상태를 노출하고,
  // CTL/ATL 은 지표 정의를, VO2MAX 는 데이터 출처를 명시한다.
  const kpiItems: Array<{ shortLabel: string; value: string; unit?: string; color: string; desc: string }> = [
    { shortLabel: t("mobileFitness.kpiCtlLabel"),  value: data.ctl.toFixed(1), color: "var(--lime)",  desc: t("fitness:kpi.ctl.sub") },
    { shortLabel: t("mobileFitness.kpiAtlLabel"),  value: data.atl.toFixed(1), color: "var(--rose)",  desc: t("fitness:kpi.atl.sub") },
    { shortLabel: t("mobileFitness.kpiTsbLabel"),  value: (data.tsb >= 0 ? "+" : "") + data.tsb.toFixed(1), color: "var(--amber)", desc: t(tsbLabelKey(data.tsb)) },
    { shortLabel: "VO2MAX",   value: vo2 != null ? String(vo2) : "—", unit: "ml/kg/min", color: "var(--aqua)", desc: vo2 != null ? t("mobileFitness.vo2maxDesc") : t("mobileFitness.vo2maxNoFtp") },
  ];

  const isBike = data.discipline === "bike";
  const showZones = data.zones.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center sticky top-0 z-10"
        style={{ height: 52, background: "var(--bg-1)", borderBottom: "1px solid var(--line-soft)", padding: "0 16px", gap: 10 }}>
        <div className="cursor-pointer flex items-center" style={{ marginLeft: -4, padding: "4px 8px 4px 0", minHeight: 44 }}
          onClick={() => navigate("/my")}>
          <ChevronLeft size={22} style={{ color: "var(--ink-1)" }} />
        </div>
        <span style={{ fontSize: "var(--fs-base)", fontWeight: 700, color: "var(--ink-0)", letterSpacing: "-0.02em" }}>{t("mobileFitness.title")}</span>
      </div>

      <SportFilterTabs value={sportSegment} onChange={setSportSegment} />

      {/* Top tabs */}
      <div className="flex" role="tablist" style={{ borderBottom: "1px solid var(--line-soft)", background: "var(--bg-1)" }}>
        {(["overview", "analysis"] as const).map((k) => {
          const label = k === "overview" ? t("mobileFitness.tabOverview") : analysisTabLabel;
          const active = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)}
              role="tab"
              aria-selected={active}
              className="flex-1 flex items-center justify-center relative"
              style={{ padding: "12px 0", fontSize: "var(--fs-sm)", fontWeight: 500, minHeight: 44,
                color: active ? "var(--ink-0)" : "var(--ink-3)", background: "none", border: "none", cursor: "pointer" }}>
              {label}
              {active && <div style={{ position: "absolute", bottom: 0, left: 16, right: 16, height: 2, background: "var(--lime)", borderRadius: "2px 2px 0 0" }} />}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div style={{ paddingTop: 14 }}>
          {/* KPI 4×1 표 — 데스크탑 FitnessPage KPI 스트립과 동일 패턴 (점+eyebrow+값+unit+desc), 모바일 폭에 맞춰 컴팩트. */}
          <SectionCard>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "var(--space-2)",
              }}
            >
              {kpiItems.map((s) => (
                <div
                  key={s.shortLabel}
                  style={{
                    padding: "var(--space-2) var(--space-3)",
                    minWidth: 0,
                  }}
                >
                  <div className="flex items-center" style={{ gap: 'var(--space-1)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <Text variant="eyebrow" as="span" style={{ fontSize: "var(--fs-xs)", letterSpacing: "0.04em" }}>{s.shortLabel}</Text>
                  </div>
                  <div className="flex items-baseline" style={{ gap: 'var(--space-1)', marginBottom: 'var(--space-1)' }}>
                    <Text as="span" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-lg)", fontWeight: 600, lineHeight: 1.1, color: s.color }}>{s.value}</Text>
                  </div>
                  {s.unit && <Text size="xs" tone="quaternary" as="div" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.2 }}>{s.unit}</Text>}
                  <Text size="xs" tone="tertiary" as="div" style={{ fontSize: "var(--fs-xs)", lineHeight: 1.3, marginTop: 'var(--space-1)' }}>{s.desc}</Text>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* PMC 추이 */}
          <SectionCard title={t("mobileFitness.pmcTitle", { n: data.pmcHistory.length })} sub={t("mobileFitness.pmcSub")}>
            {/* 전폭 카드 안에서 카드 좌우 padding(16)을 상쇄해 차트를 화면 끝까지 채운다.
                제목/범례는 카드 padding 인셋 유지. */}
            <div style={{ margin: "0 -16px" }}>
              <PmcMiniChart history={data.pmcHistory} projection={data.pmcProjection} today={data.today} color={ringColor} t={t} />
            </div>
            <div style={{ marginTop: 6, fontSize: "var(--fs-xs)", color: "var(--ink-4)", display: "flex", gap: 12 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 10, height: 2, background: ringColor }} />CTL
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 10, height: 2, background: "var(--rose)" }} />ATL
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ display: "inline-block", width: 10, height: 2, background: "var(--amber)" }} />TSB
              </span>
            </div>
          </SectionCard>

          {/* 주간 TSS */}
          {data.weeklyTSS.length > 0 && (
            <SectionCard title={t("mobileFitness.weeklyLoadTitle")} sub={t("mobileFitness.weeklyLoadSub", { thisWeek: data.thisWeekTSS, avg: data.avgWeekTSS, restDays: data.restDays })}>
              <WeeklyTssBars values={data.weeklyTSS} color={ringColor} t={t} />
            </SectionCard>
          )}

          {/* 최근 활동 */}
          {data.recentActivities.length > 0 ? (
            <SectionCard title={t("mobileFitness.recentActivities")}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.recentActivities.map((a, i) => (
                  <Link key={a.id} to={`/activity/${a.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div className="flex items-center justify-between" style={{ padding: "10px 0", borderBottom: i < data.recentActivities.length - 1 ? "1px solid var(--line-soft)" : "none" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-0)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
                        <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 2 }}>
                          {a.dateLabel}
                          {a.distanceKm != null && ` · ${a.distanceKm.toFixed(1)} km`}
                          {a.durationMin != null && ` · ${Math.floor(a.durationMin / 60)}:${String(Math.floor(a.durationMin % 60)).padStart(2, "0")}`}
                        </div>
                      </div>
                      {a.tss != null && (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)", color: "var(--ink-1)", fontWeight: 600, marginLeft: 12 }}>
                          {a.tss}<span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginLeft: 3 }}>TSS</span>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </SectionCard>
          ) : (
            <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center" }}>
              <div style={{ fontSize: "var(--fs-4xl)", marginBottom: "var(--space-3)" }}>{getDisciplineIcon(data.discipline as Discipline)}</div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500, color: "var(--ink-3)" }}>
                {t("mobileFitness.disciplineLoading", { discipline: t(getDisciplineLabelKey(data.discipline as Discipline)) })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "analysis" && (
        <div style={{ paddingTop: 14 }}>
          {/* 임계값 카드 */}
          {data.threshold && (
            <SectionCard>
              <Text variant="eyebrow">{data.threshold.label}</Text>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-3xl)", fontWeight: 600, color: "var(--ink-0)", letterSpacing: "-0.03em", marginTop: 4 }}>
                {data.threshold.value || "—"}
                {data.threshold.unit && <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-3)", marginLeft: 4 }}>{data.threshold.unit}</span>}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-4)", marginTop: 3 }}>{data.threshold.sub}</div>
            </SectionCard>
          )}

          {/* 존 분포 */}
          {showZones && (
            <SectionCard
              title={isBike ? t("mobileFitness.zonePowerTitle") : t("mobileFitness.zoneHrTitle")}
              sub={
                data.zoneSource === "power" ? t("mobileFitness.zoneSourcePower") :
                data.zoneSource === "hr" ? (isBike ? t("mobileFitness.zoneSourceHrBike") : t("mobileFitness.zoneSourceHrRun")) :
                t("mobileFitness.zoneSourceNone")
              }>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center gap-2" style={{ padding: "6px 0" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 18, textAlign: "right" }}>Z{i + 1}</div>
                  <div style={{ fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 60 }}>{z.name}</div>
                  <div style={{ flex: 1, height: 18, background: "var(--bg-3)", borderRadius: "var(--r-xs)", overflow: "hidden" }}>
                    <div style={{ width: `${z.pct}%`, height: "100%", background: z.color, borderRadius: "var(--r-xs)" }} />
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)", width: 36, textAlign: "right" }}>{z.pct}%</div>
                </div>
              ))}
            </SectionCard>
          )}

          {/* 파워 커브 (bike) */}
          {isBike && data.powerCurve && data.powerCurve.length >= 2 && (
            <SectionCard title={t("mobileFitness.powerCurveTitle")} sub={t("mobileFitness.powerCurveSub", { maxW: Math.round(Math.max(...data.powerCurve.map(p => p.maxPower))) })}>
              {/* 차트를 카드 좌우 padding(16) 상쇄해 화면 끝까지 (PMC 와 동일) */}
              <div style={{ margin: "0 -16px" }}>
                <PowerCurveMini points={data.powerCurve} color={ringColor} />
              </div>
            </SectionCard>
          )}

          {/* 존 정의 */}
          {showZones && (
            <SectionCard title={t("mobileFitness.zoneDefsSectionTitle")}>
              {data.zones.map((z, i) => (
                <div key={i} className="flex items-center" style={{ padding: "8px 0", borderBottom: i < data.zones.length - 1 ? "1px solid var(--line-soft)" : "none", gap: "var(--space-3)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-3)", width: 20 }}>Z{i + 1}</span>
                  <span style={{ fontSize: "var(--fs-sm)", color: "var(--ink-0)", flex: 1 }}>{z.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-2)" }}>{z.rangeLabel}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--ink-4)", width: 60, textAlign: "right" }}>{z.percentLabel}</span>
                </div>
              ))}
            </SectionCard>
          )}

          {!showZones && !data.threshold && (
            <div style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", fontSize: "var(--fs-sm)", color: "var(--ink-3)" }}>
              {t("mobileFitness.analysisInsufficient")}
            </div>
          )}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  );
}

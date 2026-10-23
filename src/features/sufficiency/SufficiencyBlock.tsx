import DetailsSection from "../../components/redesign/DetailsSection";
/**
 * 데이터 충분도 표시 — 서버가 같은 계산에서 함께 만든 블록을 **그대로** 보여 준다.
 *
 * 기획: orider-doc/planning/RESULT_데이터충분도.md §3.2 표시 규칙.
 * - 상태·남은 요건 수·다음 행동은 서버 값이다. 여기서 다시 세거나 판정하지 않는다.
 * - 「바로 열려요」는 남은 요건이 하나이고 그 요건이 충분조건일 때만 쓴다(블록 필드를 읽을 뿐).
 * - 품질 조건은 수치 없이 "무엇이 도움이 되는지"만 말한다. 퍼센트 막대 없음.
 * - 가정값 결과는 「가정값」 칩과 입력 행동을 같은 자리에 둔다(칩만 두지 않는다).
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { SufficiencyBlock, SufficiencyRequirement, SufficiencySet, SufficiencyState } from "@shared/types/sufficiency";
import { Card, Chip, Text, buttonClass } from "../../theme/components";
import { LocalizedLink } from "../../components/LocalizedLink";
import { displayedSufficiencyState } from "../../services/sufficiencyContract";
import "./SufficiencyBlock.css";
import { trackSufficiencyView } from "./sufficiencyAnalytics";

/** 행동 코드 → 이동할 화면. 서버는 코드만 주고, 경로는 웹이 정적으로 가진다(자유 URL 없음). */
const ACTION_TARGETS: Partial<Record<string, string>> = {
  input_weight: "/settings/account#body-info",
  confirm_weight: "/settings/account#body-info",
  connect_power_meter: "/settings/device",
  record_power_ride: "/settings/connections",
  record_activity: "/settings/connections",
};

function featureLabelKey(block: SufficiencyBlock): string {
  return block.featureId === "vo2max" && block.viewId === "monthly"
    ? "sufficiency.view.vo2max.monthly" : `sufficiency.feature.${block.featureId}`;
}

/** 남은 요건이 충분조건 하나뿐인가 — 「바로 열려요」를 써도 되는 유일한 경우. */
function onlySufficientRemains(block: SufficiencyBlock): boolean {
  const unmet = block.requirements.filter(row => row.satisfaction !== "met");
  return block.remainingRequirementCount === 1 && unmet.length === 1 && unmet[0]!.guarantee === "sufficient";
}

function RequirementLine({ row }: { row: SufficiencyRequirement }) {
  const { t } = useTranslation("fitness");
  const excluded = (row.excluded ?? []).map(item => t(`sufficiency.excluded.${item.reason}`, { n: item.count })).join(", ");
  const text = t(`sufficiency.req.${row.requirementId}.${row.satisfaction}`, {
    target: row.target?.value, current: row.current?.value,
  });
  return <li data-testid={`sufficiency-req-${row.requirementId}`}>
    <Text as="span" variant="bodySmall" tone={row.satisfaction === "met" ? "tertiary" : "secondary"}>
      {row.satisfaction === "met" ? "✓ " : "· "}{text}{excluded ? ` (${t("sufficiency.excludedPrefix")} ${excluded})` : ""}
    </Text>
  </li>;
}

function ActionLine({ block, testId }: { block: SufficiencyBlock; testId: string }) {
  const { t } = useTranslation("fitness");
  const code = block.nextAction?.code;
  if (!code) return null;
  const target = ACTION_TARGETS[code];
  return target
    ? <LocalizedLink data-testid={`${testId}-action`} to={target} className={buttonClass({ variant: "ghost", size: "sm" })}>
        {t(`sufficiency.action.${code}`)} →
      </LocalizedLink>
    : <Text data-testid={`${testId}-action`} as="p" variant="bodySmall" tone="secondary">{t(`sufficiency.action.${code}`)}</Text>;
}

function headline(t: (key: string, options?: Record<string, unknown>) => string, block: SufficiencyBlock,
  state: SufficiencyState): string {
  if (state === "delayed") return t("sufficiency.state.delayed");
  if (state === "processing") return t("sufficiency.state.processing");
  if (block.remainingRequirementCount === 0) return t("sufficiency.state.unavailable");
  if (onlySufficientRemains(block) && block.nextAction) {
    return t("sufficiency.state.openOnAction", { action: t(`sufficiency.action.${block.nextAction.code}`) });
  }
  return t("sufficiency.state.locked", { n: block.remainingRequirementCount });
}

/** 잠긴 기능 자리에 서는 카드. 열린 기능에는 쓰지 않는다(값이 그 자리에 있다). */
export function SufficiencyCard({ set, block, testId, compact = false, hideTiming = false }: { set: SufficiencySet; block: SufficiencyBlock; testId: string; compact?: boolean; hideTiming?: boolean }) {
  const { t } = useTranslation("fitness");
  const state = displayedSufficiencyState(set, block, Date.now());
  useEffect(() => { trackSufficiencyView(set, block, state, "card"); }, [set, block, state]);
  const showDetails = state === "locked" && block.remainingRequirementCount > 0;
  const Container = compact ? "article" : Card;
  return <Container data-testid={testId} className={compact ? "sufficiency-evidence-row" : undefined} aria-label={t(featureLabelKey(block))}>
    <Text as="p" variant="eyebrow">{t(featureLabelKey(block))}</Text>
    <Text data-testid={`${testId}-state`} as="p" variant="bodyMedium" style={{ marginTop: "var(--space-1)" }}>
      {headline(t, block, state)}
    </Text>
    {showDetails && <Text data-testid={`${testId}-remaining`} as="p" variant="caption" tone="tertiary">
      {t("sufficiency.remaining", { n: block.remainingRequirementCount })}
    </Text>}
    {!hideTiming && <Text as="p" variant="caption" tone="tertiary">{t("sufficiency.asOf", { date: new Date(set.asOf).toLocaleDateString() })}
      {set.nextUpdateAt != null && ` · ${t("sufficiency.nextUpdate", { date: new Date(set.nextUpdateAt).toLocaleDateString() })}`}
    </Text>}
    {showDetails && <>
      <ul data-testid={`${testId}-requirements`} className="mt-2 space-y-1">
        {block.requirements.map(row => <RequirementLine key={row.requirementId} row={row} />)}
      </ul>
      <div className="mt-3"><ActionLine block={block} testId={testId} /></div>
    </>}
  </Container>;
}

/**
 * 값 옆 한 줄 — 낮은 근거로 열린 기능(가정값 포함). 칩과 행동을 함께 둔다.
 * 열림·잠김 등 다른 상태에서는 아무것도 그리지 않는다(카드가 그 자리를 맡는다).
 */
export function SufficiencyInline({ set, block, testId }: { set: SufficiencySet; block: SufficiencyBlock; testId: string }) {
  const { t } = useTranslation("fitness");
  const state = displayedSufficiencyState(set, block, Date.now());
  const visible = state === "low_evidence" || state === "delayed" || state === "processing";
  useEffect(() => { if (visible) trackSufficiencyView(set, block, state, "inline"); }, [set, block, state, visible]);
  if (!visible) return null;
  const assumed = block.source.assumedInputs.length > 0;
  const showRequirements = state === "low_evidence";
  const quality = showRequirements && block.featureId === "load_history" && block.requirements.some(row => row.requirementId === "load_quality" && row.satisfaction !== "met");
  const missingExplanation = showRequirements && block.remainingRequirementCount > block.requirements.filter(row => row.satisfaction !== "met").length;
  return <div data-testid={testId} className="flex flex-wrap items-center gap-2 mt-1">
    {(state === "delayed" || state === "processing") && <Text as="span" variant="caption">{t(`sufficiency.state.${state}`)}</Text>}
    {(assumed || state === "low_evidence") && <Chip variant="warning">{t(assumed ? "sufficiency.chip.assumed" : "sufficiency.chip.lowEvidence")}</Chip>}
    {assumed && <Text as="span" variant="caption" tone="tertiary">
      {block.source.assumedInputs.map(input => t(`sufficiency.assumedInput.${input}`)).join(", ")}
    </Text>}
    {showRequirements && block.remainingRequirementCount > 0 && <Text data-testid={`${testId}-remaining`} as="span" variant="caption" tone="tertiary">{t(quality ? "sufficiency.evidenceRemaining" : "sufficiency.remaining", { n: block.remainingRequirementCount })}</Text>}
    {showRequirements && <div className="sufficiency-inline-requirements" data-testid={`${testId}-requirement`}>
      <ul>{block.requirements.map(row => <RequirementLine key={row.requirementId} row={row} />)}</ul>
      {quality && <>
        <Text as="p" variant="bodySmall" tone="secondary">{t("sufficiency.loadQuality.basis")}</Text>
        <Text as="p" variant="bodySmall" tone="secondary">{t("sufficiency.loadQuality.criterion")}</Text>
        <Text as="p" variant="caption" tone="tertiary">{t("sufficiency.loadQuality.scope")}</Text>
      </>}
      {missingExplanation && <Text as="p" variant="bodySmall" tone="secondary">{t("sufficiency.requirementUnavailable")}</Text>}
    </div>}
    {quality && <LocalizedLink data-testid={`${testId}-review`} to={`/athlete/me/activities?sport=${block.discipline}`} className={buttonClass({ variant: "ghost", size: "sm" })}>{t("sufficiency.loadQuality.review")} →</LocalizedLink>}
    {state === "low_evidence" && <ActionLine block={block} testId={testId} />}
  </div>;
}

/** 이 기능의 블록. 블록이 없으면(도입 이전 문서·모양 오류) undefined — 호출부는 기존 표시를 쓴다. */
export function findSufficiencyBlock(set: SufficiencySet | null | undefined, featureId: string,
  viewId?: string): SufficiencyBlock | undefined {
  return set?.blocks.find(block => block.featureId === featureId && (viewId === undefined || block.viewId === viewId));
}

/** 잠긴 자리를 카드로 대신해야 하는가. 열림·낮은 근거·해당 없음이면 아니다. */
export function needsSufficiencyCard(set: SufficiencySet, block: SufficiencyBlock | undefined): block is SufficiencyBlock {
  if (!block) return false;
  const state = displayedSufficiencyState(set, block, Date.now());
  return state === "locked" || state === "processing" || state === "delayed";
}

/** 카탈로그 역색인. 입력으로 즉시 열리는 개수가 아니라 해당 입력을 쓰는 기능 목록이다. */
const INPUT_FEATURES = {
  weight: ["vo2max", "rider_profile"],
  ftp: ["training_zones"],
  thresholdPace: ["training_zones"],
  css: ["training_zones"],
} as const;
export function SufficiencyInputMap() {
  const { t } = useTranslation("fitness");
  return <div data-testid="K1-5-sufficiency-input-map">
    <Text as="p" variant="caption" tone="secondary">{t("sufficiency.inputMap")}</Text>
    {Object.entries(INPUT_FEATURES).map(([input, features]) => <Text as="p" key={input} variant="caption" tone="tertiary">
      {t(`sufficiency.input.${input}`)} · {features.map(feature => t(`sufficiency.feature.${feature}`)).join(", ")}
    </Text>)}
  </div>;
}

/** 서로 다른 owner의 요건을 합산하지 않고 기능별로 펼친다. */
export function SufficiencyGroup({ set, sets, testId, inline = false, collapsible = false, summaryOnly = false }: { set?: SufficiencySet; sets?: SufficiencySet[]; testId: string; inline?: boolean; collapsible?: boolean; summaryOnly?: boolean }) {
  const { t } = useTranslation("fitness");
  const rows = (sets ?? (set ? [set] : [])).flatMap(owner => owner.blocks
    .filter(block => needsSufficiencyCard(owner, block)).map(block => ({ owner, block })));
  const blocks = rows.map(row => row.block);
  if (rows.length <= 3) return null;
  // 카탈로그 역색인의 정적 순서: 여러 기능에서 쓰이는 행동 우선. 실제 해제 수를 계산하지 않는다.
  const actionFeatures: Record<string, readonly string[]> = {
    connect_power_meter: ["power_model", "ftp_estimate", "vo2max", "rider_profile", "power_curve"],
    record_power_ride: ["power_model", "ftp_estimate", "vo2max", "rider_profile", "power_curve"],
    ride_varied_efforts: ["power_model", "ftp_estimate", "rider_profile"],
    input_weight: INPUT_FEATURES.weight, confirm_weight: INPUT_FEATURES.weight,
    record_activity: ["load_history", "training_zones"], keep_recording: ["load_history"],
  };
  const representative = rows.filter(({ block }) => block.nextAction != null).sort((a, b) =>
    (actionFeatures[b.block.nextAction!.code]?.length ?? 0) - (actionFeatures[a.block.nextAction!.code]?.length ?? 0))[0];
  const commonTiming = rows.every(({ owner }) => owner.asOf === rows[0]!.owner.asOf && owner.nextUpdateAt === rows[0]!.owner.nextUpdateAt);
  const allLocked = rows.every(({ owner, block }) => displayedSufficiencyState(owner, block, Date.now()) === "locked" && block.remainingRequirementCount > 0);
  if (summaryOnly) return representative && displayedSufficiencyState(representative.owner, representative.block, Date.now()) === "locked"
    ? <Card data-testid={testId} padding="compact"><Text as="p" variant="bodySmall">{t(featureLabelKey(representative.block))} · {headline(t, representative.block, "locked")}</Text><ActionLine block={representative.block} testId={testId} /></Card> : null;
  if (collapsible) return <div data-testid={testId}><DetailsSection title={t("sufficiency.groupEvidence", { n: blocks.length })}>
    {rows.map(({ owner, block }) => <SufficiencyCard compact key={`${block.discipline}-${block.featureId}-${block.viewId}`} set={owner} block={block} testId={`${testId}-${block.featureId}-${block.viewId}`} />)}
  </DetailsSection></div>;
  return <Card data-testid={testId} padding="card">
    <Text as="p" variant="bodyMedium">{t(inline || !allLocked ? "sufficiency.groupEvidence" : "sufficiency.group", { n: blocks.length })}</Text>
    {!inline && <ul>{rows.map(({ owner, block }) => <li key={`${block.discipline}-${block.featureId}-${block.viewId}`}>
      {t(featureLabelKey(block))} · {headline(t, block, displayedSufficiencyState(owner, block, Date.now()))}
    </li>)}</ul>}
    {!inline && representative && displayedSufficiencyState(representative.owner, representative.block, Date.now()) === "locked" && <ActionLine block={representative.block} testId={testId} />}
    {inline ? <div data-testid={`${testId}-inline`} className="condition-sufficiency-evidence">{rows.map(({ owner, block }) => <SufficiencyCard compact hideTiming={commonTiming} key={`${block.discipline}-${block.featureId}-${block.viewId}`} set={owner} block={block} testId={`${testId}-${block.featureId}-${block.viewId}`} />)}</div> : <details data-testid={`${testId}-expand`}><summary>{t("sufficiency.expand")}</summary>
      {rows.map(({ owner, block }) => <SufficiencyCard key={`${block.discipline}-${block.featureId}-${block.viewId}`} set={owner} block={{ ...block, nextAction: null }} testId={`${testId}-${block.featureId}-${block.viewId}`} />)}
    </details>}
    {inline && commonTiming && <Text as="p" variant="caption" tone="tertiary">{t("sufficiency.asOf", { date: new Date(rows[0]!.owner.asOf).toLocaleDateString() })}{rows[0]!.owner.nextUpdateAt != null && ` · ${t("sufficiency.nextUpdate", { date: new Date(rows[0]!.owner.nextUpdateAt!).toLocaleDateString() })}`}</Text>}
  </Card>;
}

export function isSufficiencyGrouped(...sets: Array<SufficiencySet | null | undefined>): boolean {
  return sets.flatMap(set => set ? set.blocks.filter(block => needsSufficiencyCard(set, block)) : []).length > 3;
}

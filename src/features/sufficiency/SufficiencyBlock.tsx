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
import { Card, Chip, Text } from "../../theme/components";
import { LocalizedLink } from "../../components/LocalizedLink";
import { displayedSufficiencyState } from "../../services/sufficiencyContract";
import { trackSufficiencyView } from "./sufficiencyAnalytics";

/** 행동 코드 → 이동할 화면. 서버는 코드만 주고, 경로는 웹이 정적으로 가진다(자유 URL 없음). */
const ACTION_TARGETS: Partial<Record<string, string>> = {
  input_weight: "/coach/condition#thresholds",
  confirm_weight: "/coach/condition#thresholds",
  connect_power_meter: "/settings/device",
  record_power_ride: "/settings/connections",
  record_activity: "/settings/connections",
};

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
    ? <LocalizedLink data-testid={`${testId}-action`} to={target} className="text-[var(--aqua)] font-semibold">
        {t(`sufficiency.action.${code}`)} →
      </LocalizedLink>
    : <Text data-testid={`${testId}-action`} as="p" variant="bodySmall" tone="secondary">{t(`sufficiency.action.${code}`)}</Text>;
}

function headline(t: (key: string, options?: Record<string, unknown>) => string, block: SufficiencyBlock,
  state: SufficiencyState): string {
  if (state === "delayed") return t("sufficiency.state.delayed");
  if (state === "processing") return t("sufficiency.state.processing");
  if (onlySufficientRemains(block) && block.nextAction) {
    return t("sufficiency.state.openOnAction", { action: t(`sufficiency.action.${block.nextAction.code}`) });
  }
  return t("sufficiency.state.locked", { n: block.remainingRequirementCount });
}

/** 잠긴 기능 자리에 서는 카드. 열린 기능에는 쓰지 않는다(값이 그 자리에 있다). */
export function SufficiencyCard({ set, block, testId }: { set: SufficiencySet; block: SufficiencyBlock; testId: string }) {
  const { t } = useTranslation("fitness");
  const state = displayedSufficiencyState(set, block, Date.now());
  useEffect(() => { trackSufficiencyView(set, block, state, "card"); }, [set, block, state]);
  const showDetails = state !== "delayed" && state !== "processing";
  return <Card data-testid={testId} padding="card" aria-label={t(`sufficiency.feature.${block.featureId}`)}>
    <Text as="p" variant="eyebrow">{t(`sufficiency.feature.${block.featureId}`)}</Text>
    <Text data-testid={`${testId}-state`} as="p" variant="bodyMedium" style={{ marginTop: "var(--space-1)" }}>
      {headline(t, block, state)}
    </Text>
    {showDetails && <>
      <ul data-testid={`${testId}-requirements`} className="mt-2 space-y-1">
        {block.requirements.map(row => <RequirementLine key={row.requirementId} row={row} />)}
      </ul>
      <div className="mt-3"><ActionLine block={block} testId={testId} /></div>
      <Text as="p" variant="caption" tone="tertiary" style={{ marginTop: "var(--space-2)" }}>
        {t("sufficiency.asOf", { date: new Date(set.asOf).toLocaleDateString() })}
      </Text>
    </>}
  </Card>;
}

/**
 * 값 옆 한 줄 — 낮은 근거로 열린 기능(가정값 포함). 칩과 행동을 함께 둔다.
 * 열림·잠김 등 다른 상태에서는 아무것도 그리지 않는다(카드가 그 자리를 맡는다).
 */
export function SufficiencyInline({ set, block, testId }: { set: SufficiencySet; block: SufficiencyBlock; testId: string }) {
  const { t } = useTranslation("fitness");
  const state = displayedSufficiencyState(set, block, Date.now());
  const visible = state === "low_evidence";
  useEffect(() => { if (visible) trackSufficiencyView(set, block, state, "inline"); }, [set, block, state, visible]);
  if (!visible) return null;
  const assumed = block.source.assumedInputs.length > 0;
  // 가정값이 아니면 무엇이 모자란지 한 줄로 말한다(서버 요건을 그대로, 예: "첫 기록 10일째 · 42일째부터").
  const unmet = assumed ? undefined : block.requirements.find(row => row.satisfaction !== "met");
  return <div data-testid={testId} className="flex flex-wrap items-center gap-2 mt-1">
    <Chip variant="warning">{t(assumed ? "sufficiency.chip.assumed" : "sufficiency.chip.lowEvidence")}</Chip>
    {assumed && <Text as="span" variant="caption" tone="tertiary">
      {block.source.assumedInputs.map(input => t(`sufficiency.assumedInput.${input}`)).join(", ")}
    </Text>}
    {unmet && <Text data-testid={`${testId}-requirement`} as="span" variant="caption" tone="tertiary">
      {t(`sufficiency.req.${unmet.requirementId}.not_met`, { target: unmet.target?.value, current: unmet.current?.value })}
    </Text>}
    <ActionLine block={block} testId={testId} />
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

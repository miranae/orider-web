import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";

/**
 * 스트라바형 카드의 AI 요약 블록 — 활동 doc 에 비정규화된 `aiSummaryPreview`(ko) /
 * `aiSummaryPreview_en` 이 있을 때만 노출. 온디맨드 생성(getActivityNarrative)이라 대부분
 * 활동엔 없음 → 호출부에서 null 가드. 피드 가독성을 위해 2줄로 클램프(전문은 상세 AI 분석에서).
 *
 * 다국어: 현재 로케일(en*)이면 영어 슬롯을 우선, 없으면 한국어로 폴백(lazy 슬롯 미생성 케이스).
 */
export default function ActivityAiSummary({ summary, summaryEn, inset = true }: { summary?: string | null; summaryEn?: string | null; inset?: boolean }) {
  const { t, i18n } = useTranslation("activity");
  const isEn = i18n.language?.startsWith("en");
  const text = isEn ? (summaryEn || summary) : (summary || summaryEn);
  if (!text) return null;
  return (
    <div
      className={`${inset ? "mx-4" : ""} mb-3 rounded-[var(--r-md)] px-3 py-2`}
      style={{ background: "color-mix(in oklch, var(--lime) 8%, var(--bg-2))", border: "1px solid color-mix(in oklch, var(--lime) 25%, transparent)" }}
    >
      <div className="flex items-center gap-1 mb-1 text-[length:var(--fs-xs)] font-bold" style={{ color: "var(--lime)" }}>
        <Sparkles size={12} />
        {t("card.aiSummary")}
      </div>
      <p className="text-[length:var(--fs-sm)] leading-relaxed line-clamp-2" style={{ color: "var(--ink-1)" }}>
        {text}
      </p>
    </div>
  );
}

/**
 * 훈련 데이터 lazy revalidate 상태를 알리는 슬림 칩.
 *
 * 두 가지 모드:
 *   - 'updating': 재계산 진행 중 — pulse 애니메이션
 *   - 'success' : 재계산 직후 1.5초 — fade-in 후 자동 해제
 *
 * 사용처: useFreshTraining 훅의 { revalidating, justRecomputed } 와 함께 사용.
 *   <RevalidatingIndicator
 *     visible={revalidating || justRecomputed}
 *     mode={revalidating ? "updating" : "success"}
 *   />
 */
import { useTranslation } from "react-i18next";

interface RevalidatingIndicatorProps {
  visible: boolean;
  /** 'updating' = 진행 중(pulse), 'success' = 직후 완료(✓). 기본 'updating'. */
  mode?: "updating" | "success";
  /** 커스텀 메시지 (기본값을 override). 짧은 화면에 사용. */
  message?: string;
}

export function RevalidatingIndicator({
  visible,
  mode = "updating",
  message,
}: RevalidatingIndicatorProps) {
  const { t } = useTranslation("training");

  if (!visible) return null;

  const isSuccess = mode === "success";
  const label = message ?? (isSuccess ? t("revalidatingIndicator.done") : t("revalidatingIndicator.updating"));

  // 색상 — updating은 aqua(중립), success는 lime(긍정)
  const accent = isSuccess ? "var(--lime)" : "var(--aqua)";

  return (
    <div
      // updating은 진행 알림이라 polite로 읽어주지만, success는 매 페이지 진입마다
      // 깜빡 띄우는 트랜지언트라 스크린리더 피로를 줄이기 위해 알림에서 제외.
      role={isSuccess ? undefined : "status"}
      aria-live={isSuccess ? "off" : "polite"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 'var(--space-2)',
        padding: "4px 10px",
        fontSize: 11,
        borderRadius: 999,
        background: isSuccess
          ? "color-mix(in oklch, var(--lime) 14%, transparent)"
          : "color-mix(in oklch, var(--aqua) 14%, transparent)",
        color: accent,
        fontWeight: 500,
        // updating은 천천히 pulse, success는 한 번 fade-in (rd-pulse 1cycle ≈ fade in)
        animation: isSuccess ? "rd-fade-in 0.4s ease-out" : "rd-pulse 1.4s ease-in-out infinite",
        transition: "opacity 0.4s ease-out",
      }}
    >
      {isSuccess ? (
        <span aria-hidden style={{ fontSize: 12, lineHeight: 1, fontWeight: 700, color: accent }}>
          ✓
        </span>
      ) : (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: accent,
            flexShrink: 0,
          }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

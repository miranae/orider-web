import type { ReactNode } from 'react';
import { CircleCheck, Info, TriangleAlert } from 'lucide-react';
import { cn } from './cn';

export type ToastTone = 'success' | 'error' | 'info';

/** 화면 아래 가운데에 알림을 쌓는 고정 영역. 하단 탭 막대·고정 작업 막대 위로 올라간다. */
export function ToastViewport({ children }: { children: ReactNode }) {
  return <div className="ds-toast-viewport">{children}</div>;
}

export interface ToastProps {
  tone: ToastTone;
  /** 문구(최대 2줄, 한국어는 어절 단위 줄바꿈). 누를 수 있는 문구도 그대로 넘긴다. */
  children: ReactNode;
  onDismiss: () => void;
  dismissLabel: string;
  /** 닫히는 중(사라지는 움직임). */
  leaving?: boolean;
}

const ICON = { success: CircleCheck, error: TriangleAlert, info: Info } as const;

/**
 * 결과 알림 한 개 — 의미 색으로 채운 띠, 왼쪽 의미 아이콘(성공 = 원 안 체크, 실패 = 경고 삼각형, 정보 = i),
 * 오른쪽 닫기 ×. 실패 아이콘에 ×를 쓰지 않는다(닫기와 혼동). 오류는 role=alert, 그 밖은 role=status.
 */
export function Toast({ tone, children, onDismiss, dismissLabel, leaving }: ToastProps) {
  const Icon = ICON[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={cn('ds-toast', `ds-toast--${tone}`, leaving && 'ds-toast--leaving')}
    >
      <Icon className="ds-toast__icon" aria-hidden />
      <div className="ds-toast__message">{children}</div>
      <button type="button" className="ds-toast__close" onClick={onDismiss} aria-label={dismissLabel}>×</button>
    </div>
  );
}

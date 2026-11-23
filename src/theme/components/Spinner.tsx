import { cn } from './cn';

export interface SpinnerProps {
  /** sm 12px(글자 옆), lg 36px(아바타·미디어 위 진행 표시). */
  size?: 'sm' | 'lg';
  className?: string;
}

/**
 * 끝을 모르는 진행 표시 — 장식이므로 읽지 않는다. 진행 상태 이름("업로드 중…")은
 * 호출자가 감싼 컨트롤의 aria-label 이나 role="status" 로 전달한다. 색은 currentColor.
 */
export function Spinner({ size = 'sm', className }: SpinnerProps) {
  return <span aria-hidden className={cn('ds-spinner', size === 'lg' && 'ds-spinner--lg', className)} />;
}

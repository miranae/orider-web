import type { CSSProperties, ReactNode } from "react";
import { useInRouterContext } from "react-router-dom";
import { LocalizedLink } from "../../LocalizedLink";

/**
 * 경고·오류 문구를 누르면 그 상황을 해소하는 곳으로 간다 — 옆에 버튼이나 설명을 덧붙이지 않고
 * 이미 보이는 문구 자체가 해결 경로가 된다(경고·알림 정책).
 * `to` 는 앱 안 해결 화면(필요하면 services/focusTarget 의 ?focus= 링크), `onClick` 은 다시 불러오기·로그인 같은 제자리 해소.
 */
export interface Resolve {
  to?: string;
  onClick?: () => void;
}

/** 문구 모양은 그대로 두고 누를 수 있다는 것만 커서·밑줄(호버·키보드 초점)로 드러낸다. */
export const RESOLVABLE_CLASS =
  "appearance-none bg-transparent border-0 p-0 m-0 [font:inherit] [color:inherit] text-left cursor-pointer underline-offset-2 decoration-dotted hover:underline focus-visible:underline focus-visible:outline-none";

export function Resolvable({ resolve, children, className, style, onResolved }: {
  resolve?: Resolve;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** 누른 뒤 감싼 쪽이 할 일(알림 닫기 등). */
  onResolved?: () => void;
}) {
  const inRouter = useInRouterContext();
  const cls = className ? `${RESOLVABLE_CLASS} ${className}` : RESOLVABLE_CLASS;
  if (resolve?.to && inRouter) {
    return <LocalizedLink to={resolve.to} className={cls} style={style} onClick={() => { resolve.onClick?.(); onResolved?.(); }}>{children}</LocalizedLink>;
  }
  if (resolve?.onClick) {
    return <button type="button" className={cls} style={style} onClick={() => { resolve.onClick?.(); onResolved?.(); }}>{children}</button>;
  }
  // 해결 경로가 없거나(라우터 밖에서 경로만 받은 경우 포함) 정하지 않은 경고는 그대로 보인다.
  return <span className={className} style={style}>{children}</span>;
}

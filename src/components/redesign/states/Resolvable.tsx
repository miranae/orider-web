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
  "ds-tap-target appearance-none bg-transparent border-0 p-0 m-0 [font:inherit] [color:inherit] text-left cursor-pointer underline-offset-2 decoration-dotted hover:underline focus-visible:underline focus-visible:outline-none";

interface ResolvableProps {
  resolve?: Resolve;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** 누른 뒤 감싼 쪽이 할 일(알림 닫기 등). */
  onResolved?: () => void;
}

export function Resolvable(props: ResolvableProps) {
  const { resolve, children, className, style, onResolved } = props;
  // 라우터 훅은 경로가 있을 때만 쓴다 — 해결 경로 없는 상태 상자는 라우터 없이(또는 라우터를 일부만 흉내 낸 테스트에서도) 그려져야 한다.
  if (resolve?.to) return <ResolvableRoute {...props} to={resolve.to} />;
  if (resolve?.onClick) {
    return <button type="button" className={resolvableClass(className)} style={style} onClick={() => { resolve.onClick?.(); onResolved?.(); }}>{children}</button>;
  }
  return <span className={className} style={style}>{children}</span>;
}

function resolvableClass(className?: string) {
  return className ? `${RESOLVABLE_CLASS} ${className}` : RESOLVABLE_CLASS;
}

function ResolvableRoute({ to, resolve, children, className, style, onResolved }: ResolvableProps & { to: string }) {
  const inRouter = useInRouterContext();
  const handle = () => { resolve?.onClick?.(); onResolved?.(); };
  if (inRouter) return <LocalizedLink to={to} className={resolvableClass(className)} style={style} onClick={handle}>{children}</LocalizedLink>;
  // 라우터 밖(임베드 부트스트랩 등)에서 경로만 받았으면 onClick 이 있을 때만 누를 수 있다.
  if (resolve?.onClick) return <button type="button" className={resolvableClass(className)} style={style} onClick={handle}>{children}</button>;
  return <span className={className} style={style}>{children}</span>;
}

import { useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { UNSAFE_LocationContext as LocationContext, useLocation, useNavigationType, type Location } from "react-router-dom";
import { isDetailRoute, PRIMARY_HUBS, type HubKey } from "../config/navHubs";

/**
 * 기본 허브(홈·코치·클럽·탐색·게시판) 화면을 브라우저 탭처럼 살려 둔다. 다른 탭으로 가면 지우지 않고 보이지만
 * 않게 하고, 돌아오면 다시 열지 않고 보던 그대로 보인다. 효과(구독·지도)도 그대로 둔다 — 정리했다 다시 돌리면
 * 지도가 처음 시점으로 돌아가 목록 높이가 줄었다 느는 등 화면이 다시 열리는 것처럼 흔들리고, 구독을 다시 열면
 * 문서를 처음부터 다시 읽는다. 숨긴 화면은 자기 위치(경로·쿼리)를 계속 보게 해 다른 탭의 URL 에 반응하지 않는다.
 * 상세·설정 같은 허브 밖 화면은 살려 두지 않는다.
 */
export function RetainedHubPages({ path, hub, owner, children }: {
  path: string;
  hub: HubKey;
  /** 계정이 바뀌면 이전 계정의 화면을 버린다. */
  owner: string | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const pages = useRef(new Map<HubKey, { location: Location; node: ReactNode }>());
  const pagesOwner = useRef(owner);
  if (pagesOwner.current !== owner) {
    pages.current.clear();
    pagesOwner.current = owner;
  }
  const retained = !isDetailRoute(path) && PRIMARY_HUBS.some(primary => primary.key === hub);
  if (retained) pages.current.set(hub, { location, node: children });
  return <>
    {[...pages.current].map(([key, page]) => (
      <div key={`${owner ?? ""}:${key}`} data-hub-page={key} hidden={!(retained && key === hub)}>
        <LocationContext.Provider value={{ location: page.location, navigationType }}>{page.node}</LocationContext.Provider>
      </div>
    ))}
    {!retained && children}
  </>;
}

/** 처음 열 때만 진입 애니메이션을 준다 — 숨겼다 다시 보일 때(display 복귀) 애니메이션이 다시 돌지 않게. */
export function EnteringShell({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const [entered, setEntered] = useState(false);
  return <div {...rest} className={entered ? className : `${className ?? ""} animate-page-in`}
    onAnimationEnd={event => { if (event.target === event.currentTarget) setEntered(true); }}>{children}</div>;
}

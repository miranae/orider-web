import { useContext, useMemo, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { UNSAFE_LocationContext as LocationContext, UNSAFE_NavigationContext as NavigationContext, useLocation, useNavigationType, type Location } from "react-router-dom";
import { isDetailRoute, PRIMARY_HUBS, type HubKey } from "../config/navHubs";
import { isHubReturnState } from "../services/hubReturn";
import { RetainedPageContext } from "../contexts/RetainedPageContext";

/**
 * 기본 허브(홈·코치·클럽·탐색·게시판) 화면을 브라우저 탭처럼 살려 둔다. 다른 탭으로 가면 지우지 않고 보이지만
 * 않게 하고, 돌아오면 다시 열지 않고 보던 그대로 보인다. 효과(구독·지도)도 그대로 둔다 — 정리했다 다시 돌리면
 * 지도가 처음 시점으로 돌아가 목록 높이가 줄었다 느는 등 화면이 다시 열리는 것처럼 흔들리고, 구독을 다시 열면
 * 문서를 처음부터 다시 읽는다. 숨긴 화면은 자기 위치(경로·쿼리)를 계속 보게 해 다른 탭의 URL 에 반응하지 않는다.
 * 상세·설정 같은 허브 밖 화면은 살려 두지 않는다.
 *
 * 허브 안의 하위 화면(코치 계획·목표, 탐색 코스·세그먼트 …)도 화면마다 따로 살려 둔다. 코치 컨디션·오늘·분석은
 * 데이터 모델을 함께 쓰는 한 레이아웃이라 한 화면으로 묶는다 — 따로 두면 계획·목표에서 분석으로 갈 때 레이아웃이
 * 새로 마운트돼 데이터를 다시 읽는 동안 로딩 골격이 잠깐 보였다(깜박임). 메모리는 최근 화면 [MAX_RETAINED] 개로 제한한다.
 */
const MAX_RETAINED = 8;

/**
 * 숨긴 화면의 이동을 막는 navigator. 숨긴 화면의 효과·타이머는 살려 두므로, 늦게 실행된 `navigate`·`setSearchParams`
 * (예: 코스 검색 250ms 디바운스)가 전역 라우터를 움직여 사용자가 고른 탭을 숨긴 화면으로 되돌렸다(#1461).
 * 화면이 다시 보이면 실제 navigator 로 돌아가므로, 그 화면의 효과가 다시 돌며 보존한 검색 상태를 URL 에 반영한다.
 */
function useInertNavigation() {
  const navigation = useContext(NavigationContext);
  return useMemo(() => ({
    ...navigation,
    navigator: {
      ...navigation.navigator,
      push: () => {},
      replace: () => {},
      go: () => {},
    },
  }), [navigation]);
}

/** 같은 레이아웃·데이터를 공유하는 경로는 한 화면으로 묶는다. */
export function retainedScreenKey(path: string): string {
  return /^\/coach\/(?:condition|today|analysis)$/.test(path) ? "/coach/fitness" : path;
}
export function RetainedHubPages({ path, hub, owner, children }: {
  path: string;
  hub: HubKey;
  /** 계정이 바뀌면 이전 계정의 화면을 버린다. */
  owner: string | null;
  children: ReactNode;
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigation = useContext(NavigationContext);
  const inertNavigation = useInertNavigation();
  const pages = useRef(new Map<string, { location: Location; node: ReactNode }>());
  const pagesOwner = useRef(owner);
  if (pagesOwner.current !== owner) {
    pages.current.clear();
    pagesOwner.current = owner;
  }
  const retained = !isDetailRoute(path) && PRIMARY_HUBS.some(primary => primary.key === hub);
  const current = retainedScreenKey(path);
  if (retained) {
    // 탭으로 같은 화면에 돌아온 이동은 새 방문이 아니다 — 새 location(key)을 주면 피드처럼 location.key 로
    // 다시 그리는 화면이 데이터를 다시 불러오는 것처럼 보인다. 보던 location 을 그대로 준다.
    const previous = pages.current.get(current)?.location;
    const revisit = previous && isHubReturnState(location.state) && previous.pathname === location.pathname
      && previous.search === location.search && previous.hash === location.hash;
    // 최근에 본 화면을 맨 뒤로 옮겨 가장 오래 안 본 화면부터 버린다.
    pages.current.delete(current);
    pages.current.set(current, { location: revisit ? previous : location, node: children });
    while (pages.current.size > MAX_RETAINED) pages.current.delete(pages.current.keys().next().value!);
  }
  return <>
    {[...pages.current].sort(([a], [b]) => a.localeCompare(b)).map(([key, page]) => {
      const visible = retained && key === current;
      return <div key={`${owner ?? ""}:${key}`} data-hub-page={key} hidden={!visible}>
        <NavigationContext.Provider value={visible ? navigation : inertNavigation}>
          <RetainedPageContext.Provider value={visible}><LocationContext.Provider value={{ location: page.location, navigationType }}>{page.node}</LocationContext.Provider></RetainedPageContext.Provider>
        </NavigationContext.Provider>
      </div>;
    })}
    {!retained && children}
  </>;
}

let shellEntered = false;

/**
 * 앱을 처음 열 때 한 번만 진입 애니메이션을 준다. 하위 화면마다 셸을 따로 살려 두므로 화면을 처음 열 때마다
 * 애니메이션이 돌면 탭 전환이 페이지를 새로 여는 것처럼 보이고, 숨겼다 다시 보일 때(display 복귀)도 다시 돈다.
 */
export function EnteringShell({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  const [entered, setEntered] = useState(() => { const first = !shellEntered; shellEntered = true; return !first; });
  return <div {...rest} className={entered ? className : `${className ?? ""} animate-page-in`}
    onAnimationEnd={event => { if (event.target === event.currentTarget) setEntered(true); }}>{children}</div>;
}

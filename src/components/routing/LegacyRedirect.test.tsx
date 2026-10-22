import { cleanup, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { LegacyRedirect, LegacySettingsRedirect, fillPathParams, resolveLegacySettingsTarget } from "./LegacyRedirect";

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function renderAt(entry: string, from: string, element: React.ReactElement) {
  cleanup();
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/:lang" element={<Outlet />}>
          <Route path={from} element={element} />
          <Route path="*" element={<LocationProbe />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  return screen.getByTestId("location").textContent;
}

describe("LegacyRedirect", () => {
  it("언어 접두를 유지하고 search·hash 를 보존한다", () => {
    expect(renderAt("/en/fitness?tab=pmc#chart", "fitness", <LegacyRedirect to="/coach/condition" />))
      .toBe("/en/coach/condition?tab=pmc#chart");
  });

  it("경로 파라미터를 치환한다", () => {
    expect(renderAt("/ko/coach/abc123", "coach/:threadId", <LegacyRedirect to="/coach/chat/:threadId" />))
      .toBe("/ko/coach/chat/abc123");
    expect(renderAt("/ko/group/g1/ride/r9?x=1", "group/:groupId/ride/:rideId", <LegacyRedirect to="/club/:groupId/rides/:rideId" />))
      .toBe("/ko/club/g1/rides/r9?x=1");
  });

  it("온보딩 쿼리를 그대로 넘긴다", () => {
    expect(renderAt("/ko/friends?source=onboarding&returnTo=%2Fko%2F", "friends", <LegacyRedirect to="/athlete/me/friends" />))
      .toBe("/ko/athlete/me/friends?source=onboarding&returnTo=%2Fko%2F");
  });

  it("fillPathParams 는 값을 인코딩한다", () => {
    expect(fillPathParams("/board/:postId", { postId: "a b" })).toBe("/board/a%20b");
  });
});

describe("LegacySettingsRedirect", () => {
  it("section 만 제거하고 나머지 쿼리·hash 를 보존한다", () => {
    expect(renderAt("/ko/settings?section=equipment&panel=bike&profileId=p1#top", "settings", <LegacySettingsRedirect />))
      .toBe("/ko/athlete/me/gear?panel=bike&profileId=p1#top");
  });

  it("section 별 새 탭으로 보낸다", () => {
    expect(resolveLegacySettingsTarget("?section=ai_coach").pathname).toBe("/settings/account");
    expect(resolveLegacySettingsTarget("?section=health_sources").pathname).toBe("/settings/connections");
    expect(resolveLegacySettingsTarget("?section=app").pathname).toBe("/settings/display");
    expect(resolveLegacySettingsTarget("?section=developer").pathname).toBe("/settings/developer");
    expect(resolveLegacySettingsTarget("?section=training").pathname).toBe("/settings/training");
    expect(resolveLegacySettingsTarget("?section=device").pathname).toBe("/settings/device");
    expect(resolveLegacySettingsTarget("?section=connections").pathname).toBe("/settings/connections");
  });

  it("장비 데이터페이지 링크는 선택 자전거와 hash를 유지하며 기기로 이동한다", () => {
    expect(renderAt("/en/settings?section=equipment&profileId=p1&panel=data-pages#editor", "settings", <LegacySettingsRedirect />)).toBe("/en/settings/device?profileId=p1&panel=data-pages#editor");
  });
  it("운동 설정은 임계값 앵커를 우선하고 다른 쿼리를 보존한다", () => {
    expect(renderAt("/ko/settings?section=training&sport=run", "settings", <LegacySettingsRedirect />)).toBe("/ko/settings/training?sport=run#thresholds");
    expect(renderAt("/en/settings/training?sport=bike#zones", "settings/training", <LegacyRedirect to="/coach/condition#thresholds" />)).toBe("/en/coach/condition?sport=bike#thresholds");
  });
  it("section 이 없거나 알 수 없으면 account", () => {
    expect(renderAt("/en/settings", "settings", <LegacySettingsRedirect />)).toBe("/en/settings/account");
    expect(resolveLegacySettingsTarget("?section=unknown&x=1")).toEqual({ pathname: "/settings/account", search: "?x=1" });
  });
});

import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { RetainedSurfaceActivity } from "./RetainedSurfaceActivity";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("숨기면 구독과 폴링을 정지하고 다시 표시해도 편집 상태를 유지한다", async () => {
  vi.useFakeTimers();
  const subscribe = vi.fn();
  const unsubscribe = vi.fn();
  const poll = vi.fn();
  function Surface() {
    const [value, setValue] = useState(0);
    useEffect(() => {
      subscribe();
      const timer = setInterval(poll, 1000);
      return () => { clearInterval(timer); unsubscribe(); };
    }, []);
    return <button onClick={() => setValue(value + 1)}>{value}</button>;
  }
  const view = render(<RetainedSurfaceActivity foreground><Surface /></RetainedSurfaceActivity>);
  fireEvent.click(screen.getByRole("button"));
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(poll).toHaveBeenCalledTimes(1);
  view.rerender(<RetainedSurfaceActivity foreground={false}><Surface /></RetainedSurfaceActivity>);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5000); });
  expect(poll).toHaveBeenCalledTimes(1);
  view.rerender(<RetainedSurfaceActivity foreground><Surface /></RetainedSurfaceActivity>);
  expect(screen.getByRole("button")).toHaveTextContent("1");
  expect(subscribe).toHaveBeenCalledTimes(2);
  await act(async () => { vi.advanceTimersByTime(1000); });
  expect(poll).toHaveBeenCalledTimes(2);
});

it("문서가 hidden이면 호스트 foreground만으로 효과를 재개하지 않는다", () => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  const mount = vi.fn();
  function Surface() { useEffect(mount, []); return <span>content</span>; }
  render(<RetainedSurfaceActivity foreground><Surface /></RetainedSurfaceActivity>);
  expect(mount).not.toHaveBeenCalled();
  visibility.mockReturnValue("visible");
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(mount).toHaveBeenCalledTimes(1);
});

function setScrollY(y: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
  window.dispatchEvent(new Event("scroll"));
}

it("코치 탭을 떠났다 돌아오면 숨기기 전 스크롤 위치로 되돌린다", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const view = render(<RetainedSurfaceActivity foreground contentVisible><span>content</span></RetainedSurfaceActivity>);
  setScrollY(640);
  view.rerender(<RetainedSurfaceActivity foreground contentVisible={false}><span>content</span></RetainedSurfaceActivity>);
  // 숨기며 문서가 줄어 생긴 위치 0 은 기록하지 않는다.
  setScrollY(0);
  view.rerender(<RetainedSurfaceActivity foreground contentVisible><span>content</span></RetainedSurfaceActivity>);
  expect(scrollTo).toHaveBeenCalledWith(0, 640);
});

it("호스트가 앱을 백그라운드로 보냈다 돌아와도 스크롤 위치를 되돌린다", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const view = render(<RetainedSurfaceActivity foreground><span>content</span></RetainedSurfaceActivity>);
  setScrollY(300);
  view.rerender(<RetainedSurfaceActivity foreground={false}><span>content</span></RetainedSurfaceActivity>);
  setScrollY(0);
  view.rerender(<RetainedSurfaceActivity foreground><span>content</span></RetainedSurfaceActivity>);
  expect(scrollTo).toHaveBeenCalledWith(0, 300);
});

it("스크롤하지 않았으면 다시 보일 때 위치를 건드리지 않는다", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  setScrollY(0);
  const view = render(<RetainedSurfaceActivity foreground contentVisible><span>content</span></RetainedSurfaceActivity>);
  view.rerender(<RetainedSurfaceActivity foreground contentVisible={false}><span>content</span></RetainedSurfaceActivity>);
  view.rerender(<RetainedSurfaceActivity foreground contentVisible><span>content</span></RetainedSurfaceActivity>);
  expect(scrollTo).not.toHaveBeenCalled();
});

it("종목(통합·사이클)마다 스크롤 위치를 따로 기억해 돌아올 때 보던 종목의 위치로 되돌린다", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const surface = (visible: boolean, key: string) =>
    <RetainedSurfaceActivity foreground contentVisible={visible} scrollKey={key}><span>content</span></RetainedSurfaceActivity>;
  const view = render(surface(true, "fitness:condition:bike"));
  setScrollY(900);
  // 통합으로 바꾸면 처음 보는 화면이라 위치를 건드리지 않고, 이후 스크롤은 통합에 기록된다.
  view.rerender(surface(true, "fitness:condition:tri"));
  expect(scrollTo).not.toHaveBeenCalled();
  setScrollY(300);
  // 사이클로 돌아가면 사이클에서 보던 위치로, 다시 통합으로 가면 통합의 위치로 옮긴다.
  view.rerender(surface(true, "fitness:condition:bike"));
  expect(scrollTo).toHaveBeenLastCalledWith(0, 900);
  setScrollY(900);
  view.rerender(surface(true, "fitness:condition:tri"));
  expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
  setScrollY(300);
  // 통합을 보던 중 코치 탭을 떠났다 돌아오면 사이클이 아니라 통합의 위치로 되돌린다.
  view.rerender(surface(false, "fitness:condition:tri"));
  setScrollY(0);
  view.rerender(surface(true, "fitness:condition:tri"));
  expect(scrollTo).toHaveBeenLastCalledWith(0, 300);
});

it("보이는 채로 맨 위에서 보던 종목으로 돌아가면 맨 위로 되돌린다", () => {
  const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const surface = (key: string) =>
    <RetainedSurfaceActivity foreground contentVisible scrollKey={key}><span>content</span></RetainedSurfaceActivity>;
  const view = render(surface("fitness:analysis:tri"));
  setScrollY(0);
  view.rerender(surface("fitness:analysis:run"));
  setScrollY(500);
  view.rerender(surface("fitness:analysis:tri"));
  expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
});

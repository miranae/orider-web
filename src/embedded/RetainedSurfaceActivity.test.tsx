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

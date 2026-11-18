import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useDialogViewport } from "./useDialogViewport";

afterEach(() => vi.unstubAllGlobals());

it("tracks keyboard-only resize and pan, retaining bounds until the last nested dialog closes", () => {
  const viewport = Object.assign(new EventTarget(), { height: 800, width: 390, offsetTop: 0, offsetLeft: 0 });
  vi.stubGlobal("visualViewport", viewport);
  const style = document.documentElement.style;
  style.setProperty("--dialog-viewport-height", "90vh", "important");
  const first = renderHook(() => useDialogViewport(true));
  const second = renderHook(() => useDialogViewport(true));
  act(() => {
    viewport.height = 280;
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event("resize"));
  });
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe("280px");
  expect(style.getPropertyValue("--dialog-viewport-top")).toBe("120px");
  first.unmount();
  act(() => {
    viewport.offsetTop = 160;
    viewport.dispatchEvent(new Event("scroll"));
  });
  expect(style.getPropertyValue("--dialog-viewport-top")).toBe("160px");
  second.unmount();
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe("90vh");
  expect(style.getPropertyPriority("--dialog-viewport-height")).toBe("important");
  expect(style.getPropertyValue("--dialog-viewport-top")).toBe("");
  viewport.dispatchEvent(new Event("resize"));
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe("90vh");
  style.removeProperty("--dialog-viewport-height");
});

it("falls back to window bounds and stops observing an inactive dialog", () => {
  vi.stubGlobal("visualViewport", undefined);
  const view = renderHook(({ active }) => useDialogViewport(active), { initialProps: { active: false } });
  const style = document.documentElement.style;
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe("");
  view.rerender({ active: true });
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe(`${window.innerHeight}px`);
  view.rerender({ active: false });
  expect(style.getPropertyValue("--dialog-viewport-height")).toBe("");
});

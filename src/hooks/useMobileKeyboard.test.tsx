import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMobileKeyboard } from "./useMobileKeyboard";

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])("restores navigation after IME dismissal without blurring the input (resize=%s)", resize => {
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 844);
  const field = document.createElement("input");
  document.body.append(field);
  const view = renderHook(() => useMobileKeyboard());
  try {
    act(() => {
      field.focus();
      viewport.height = 300;
      if (resize) vi.stubGlobal("innerHeight", 300);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
    act(() => {
      viewport.height = 844;
      vi.stubGlobal("innerHeight", 844);
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(field).toHaveFocus();
    expect(document.documentElement).not.toHaveAttribute("data-mobile-keyboard-open");
    act(() => { viewport.height = 300; viewport.dispatchEvent(new Event("resize")); });
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
  } finally {
    view.unmount();
    field.remove();
  }
  expect(document.documentElement).not.toHaveAttribute("data-mobile-keyboard-open");
});

it("keeps navigation available when focusing with a hardware keyboard", () => {
  const field = document.createElement("input");
  document.body.append(field);
  const view = renderHook(() => useMobileKeyboard());
  try {
    act(() => { field.focus(); window.dispatchEvent(new Event("resize")); });
    expect(field).toHaveFocus();
    expect(document.documentElement).not.toHaveAttribute("data-mobile-keyboard-open");
  } finally { view.unmount(); field.remove(); }
});

it("preserves the keyboard state through rotation and learns the focused dismissal height", () => {
  const viewport = Object.assign(new EventTarget(), { width: 390, height: 844, offsetTop: 0, offsetLeft: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerWidth", 390);
  vi.stubGlobal("innerHeight", 844);
  const field = document.createElement("input");
  document.body.append(field);
  const view = renderHook(() => useMobileKeyboard());
  const resize = (width: number, height: number) => act(() => {
    vi.stubGlobal("innerWidth", width); vi.stubGlobal("innerHeight", height);
    Object.assign(viewport, { width, height });
    viewport.dispatchEvent(new Event("resize"));
  });
  try {
    act(() => field.focus());
    resize(390, 300);
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
    resize(844, 160);
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
    resize(844, 350);
    expect(field).toHaveFocus();
    expect(document.documentElement).not.toHaveAttribute("data-mobile-keyboard-open");
    resize(844, 160);
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
    resize(390, 300);
    expect(document.documentElement).toHaveAttribute("data-mobile-keyboard-open");
    resize(390, 844);
    expect(field).toHaveFocus();
    expect(document.documentElement).not.toHaveAttribute("data-mobile-keyboard-open");
  } finally { view.unmount(); field.remove(); }
});

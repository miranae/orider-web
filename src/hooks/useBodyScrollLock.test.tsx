import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBodyScrollLock } from "./useBodyScrollLock";

function LockProbe({ active }: { active: boolean }) {
  useBodyScrollLock(active);
  return null;
}

describe("useBodyScrollLock", () => {
  beforeEach(() => {
    document.body.removeAttribute("style");
    Object.defineProperty(window, "scrollY", { value: 128, configurable: true });
    window.scrollTo = vi.fn();
  });

  it("locks the body with fixed positioning and restores the original scroll position", () => {
    const view = render(<LockProbe active />);

    expect(document.body.style.position).toBe("fixed");
    expect(document.body.style.top).toBe("-128px");
    expect(document.body.style.overflow).toBe("hidden");

    view.unmount();

    expect(document.body.style.position).toBe("");
    expect(document.body.style.top).toBe("");
    expect(document.body.style.overflow).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 128);
  });

  it("keeps the body locked until every active lock is released", () => {
    const first = render(<LockProbe active />);
    const second = render(<LockProbe active />);

    first.unmount();
    expect(document.body.style.position).toBe("fixed");
    expect(window.scrollTo).not.toHaveBeenCalled();

    second.unmount();
    expect(document.body.style.position).toBe("");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 128);
  });
});

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ActivityMemoText from "./ActivityMemoText";

const memo = "▰ 피크 파워 (W)\n   1s    5s   10s\n  352   323   283\n\n계측 01:58:24\n  Z1   Z2\n 18%  82%\n";

describe("automatic memo tables", () => {
  it("keeps each header/value pair in one keyboard-scrollable block without changing the source text", () => {
    const { container } = render(<p><ActivityMemoText memo={memo} generated /></p>);
    const tables = container.querySelectorAll("[tabindex='0']");
    expect(tables).toHaveLength(2);
    expect(tables[0].textContent).toBe("   1s    5s   10s\n  352   323   283");
    expect(tables[1].textContent).toBe("  Z1   Z2\n 18%  82%");
    expect(container.textContent).toBe(memo);
  });

  it("groups values that fill the first column without leading whitespace", () => {
    const source = "▰ 파워 영역\n  Z1   Z2\n100%   0%\n\n▰ 피크 파워 (W)\n    1s     5s\n100000  99999";
    const { container } = render(<p><ActivityMemoText memo={source} generated /></p>);
    const tables = container.querySelectorAll("[tabindex='0']");
    expect(tables).toHaveLength(2);
    expect(tables[0].textContent).toContain("\n100%");
    expect(tables[1].textContent).toContain("\n100000");
    expect(container.textContent).toBe(source);
  });

  it("keeps tables out of the keyboard order while the memo is collapsed", () => {
    const { container } = render(<p><ActivityMemoText memo={memo} generated tableFocusable={false} /></p>);
    expect(container.querySelector("[tabindex]")).toBeNull();
    expect(container.textContent).toBe(memo);
  });

  it("preserves authored whitespace without interpreting it as an automatic table", () => {
    const { container } = render(<p><ActivityMemoText memo={memo} /></p>);
    expect(container.textContent).toBe(memo);
    expect(container.querySelector("[tabindex]")).toBeNull();
  });
});

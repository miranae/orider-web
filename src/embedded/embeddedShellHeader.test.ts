import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 앱 피트니스·계획 탭 상단에 셸 제목과 표면 제목이 두 줄로 겹쳐 보이던 회귀를 막는다.
// jsdom 은 스타일시트를 계산하지 않으므로 규칙 자체를 고정한다.
describe("트레이닝 셸 헤더", () => {
  const css = readFileSync("src/embedded/embedded.css", "utf8");
  const rule = css.match(/\.orider-embedded-shell__header\s*\{([^}]*)\}/)?.[1] ?? "";

  it("화면에는 그리지 않고 접근성 트리에만 남긴다", () => {
    expect(rule).toMatch(/position:\s*absolute/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).toMatch(/height:\s*1px/);
    expect(rule).toMatch(/overflow:\s*hidden/);
    expect(rule).toMatch(/clip-path:\s*inset\(50%\)/);
  });

  it("display none 이나 visibility hidden 으로 제목을 접근성 트리에서 지우지 않는다", () => {
    expect(rule).not.toMatch(/display:\s*none/);
    expect(rule).not.toMatch(/visibility:\s*hidden/);
  });

  it("헤더 하위 요소에 화면 표시용 스타일을 다시 두지 않는다", () => {
    expect(css).not.toMatch(/\.orider-embedded-shell__header\s+(h1|p)\s*\{/);
  });
});

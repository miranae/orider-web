import { bodyInfoHref, FOCUS_TARGETS, revealFocusTarget, thresholdSettingsHref, withFocus } from "./focusTarget";

describe("focusTarget 링크", () => {
  it("기존 쿼리·해시를 지키며 focus 를 더한다", () => {
    expect(withFocus("/a?x=1#h", "ftp")).toBe("/a?x=1&focus=ftp#h");
  });
  it("기준값 링크는 종목 화면과 칸을 함께 지정하고 해시는 붙이지 않는다", () => {
    expect(thresholdSettingsHref("run", FOCUS_TARGETS.thresholdPace)).toBe("/settings/training?sport=run&focus=threshold-pace");
    expect(bodyInfoHref()).toBe("/settings/account?focus=weight");
  });
});

describe("revealFocusTarget", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("조상 details 를 모두 펼치고 칸 안의 입력에 초점을 둔다", () => {
    document.body.innerHTML = `<details id="o"><summary>s</summary><details id="i"><summary>s</summary><div data-focus-target="lthr"><label>x</label><input id="f"></div></details></details>`;
    const ok = revealFocusTarget(document.querySelector<HTMLElement>("[data-focus-target]")!);
    expect(ok).toBe(true);
    expect((document.getElementById("o") as HTMLDetailsElement).open).toBe(true);
    expect((document.getElementById("i") as HTMLDetailsElement).open).toBe(true);
    expect(document.activeElement?.id).toBe("f");
  });

  it("잠긴 fieldset 안의 칸은 실패로 돌려 다시 시도하게 한다", () => {
    document.body.innerHTML = `<fieldset disabled><input data-focus-target="ftp"></fieldset>`;
    expect(revealFocusTarget(document.querySelector<HTMLElement>("input")!)).toBe(false);
  });
});

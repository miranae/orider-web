import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import GlossaryText from "./GlossaryText";
import InfoTip from "../InfoTip";
import GlossaryProvider from "./GlossaryProvider";
import { splitGlossaryText, TERM_GLOSSARY } from "../../utils/termGlossary";
import ko from "../../i18n/resources/ko/termGlossary.json";
import en from "../../i18n/resources/en/termGlossary.json";

const foundTerms = (text: string) => splitGlossaryText(text).flatMap(part => part.termId ? [part.termId] : []);

describe("training term glossary", () => {
  it("keeps generic training load independent from TSS and explains its calculation basis", () => {
    expect(ko.terms.trainingLoad.description).not.toContain("TSS");
    expect(en.terms.trainingLoad.description).not.toContain("TSS");
    expect(ko.terms.trainingLoad.description).toContain("파워·심박·시간");
    expect(en.terms.trainingLoad.description).toContain("power, heart-rate or time");
  });

  it("keeps original text and uses longest aliases without acronym substring matches", () => {
    const text = "rTSS / hrTSS / TSS — W/kg, 임계 페이스, 파워 커브. if INPUT CP20 CSVfile SHIFT are ordinary text.";
    const parts = splitGlossaryText(text);
    expect(parts.map(part => part.text).join("")).toBe(text);
    expect(foundTerms(text)).toEqual(["rtss", "hrtss", "tss", "wkg", "thresholdPace", "pdc"]);
    expect(foundTerms("IF NP CP FIT CSV — if np cp fit csv")).toEqual(["if", "np", "cp", "fit", "csv"]);
  });

  it("keeps repeated terms available and supports attached sensor units", () => {
    expect(foundTerms("FTP와 FTP / 케이던스 cadence / 150bpm 90rpm 180spm 3.2W/kg"))
      .toEqual(["ftp", "ftp", "cadence", "cadence", "bpm", "rpm", "spm", "wkg"]);
    expect(foundTerms("D−23 D-12 D-day")).toEqual(["countdown", "countdown", "countdown"]);
    expect(foundTerms("주간 훈련 부하 / 훈련 부하")).toEqual(["trainingLoad", "trainingLoad"]);
    expect(foundTerms("W / NEW / IFfy")).toEqual([]);
  });

  it("matches expanded metric names before generic power, pace, and training-load words", () => {
    expect(foundTerms("Normalized power / Intensity factor / Variability index / Efficiency factor / Critical power / Functional threshold power"))
      .toEqual(["np", "if", "vi", "ef", "cp", "ftp"]);
    expect(foundTerms("Chronic training load / Acute training load / Training stress balance / Training Stress Score / Grade-adjusted pace / critical swim speed"))
      .toEqual(["ctl", "atl", "tsb", "tss", "gap", "css"]);
    expect(foundTerms("장기 훈련 부하 / 단기 훈련 부하 / 러닝 훈련 부하 점수"))
      .toEqual(["ctl", "atl", "rtss"]);
  });

  it("matches full running-power phrases before generic cycling power", () => {
    expect(foundTerms("러닝 파워 · 304 W / 러닝파워 / Running power / Running Power / running power / 파워 / Power"))
      .toEqual(["runningPower", "runningPower", "runningPower", "runningPower", "runningPower", "power", "power"]);
  });

  it("gives every registered term a neutral definition in both languages", () => {
    for (const { id, aliases } of TERM_GLOSSARY) {
      expect(ko.terms[id].label).toBeTruthy();
      expect(ko.terms[id].description).toBeTruthy();
      expect(en.terms[id].label).toBeTruthy();
      expect(en.terms[id].description).toBeTruthy();
      for (const alias of aliases) expect(foundTerms(alias), alias).toContain(id);
    }
    expect(ko.terms.ctl.description).toMatch(/6주.*최근 기록에 더 큰 비중/);
    expect(ko.terms.ctl.description).toContain("직접 측정한 값은 아닙니다");
    expect(ko.terms.atl.description).toMatch(/1주.*최근 기록에 더 큰 비중/);
    expect(ko.terms.cp.description).toContain("같은 값은 아닙니다");
  });
});

describe("GlossaryText", () => {
  it("explains event schedule and safety terms with the shared format", async () => {
    render(<GlossaryText>GPX / HH:MM / DNF / SOS / LIVE</GlossaryText>, { wrapper: GlossaryProvider });
    for (const term of ["GPX", "HH:MM", "DNF", "SOS", "LIVE"]) {
      const trigger = screen.getByRole("button", { name: `${term} 설명` });
      fireEvent.focus(trigger);
      expect(await screen.findByRole("tooltip")).toHaveClass("ds-tooltip-content");
      fireEvent.blur(trigger);
    }
  });

  it("shows help on every term while retaining every original character", async () => {
    const { container } = render(<GlossaryText>FTP / FTP / 임계 페이스</GlossaryText>, { wrapper: GlossaryProvider });
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(3));
    expect(container.textContent).toBe("FTP / FTP / 임계 페이스");
    expect(container.querySelectorAll("[data-glossary-term]")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "FTP 설명" })[0]).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "임계 페이스 설명" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "FTP 설명" })[0]).toHaveTextContent("FTP");
    expect(screen.getAllByRole("button", { name: "FTP 설명" })[0]).toHaveStyle({ color: "var(--color-primary-dark)", font: "inherit" });
    expect(container.querySelector("svg")).toBeNull();
  });

  it("opens one sport-specific explanation for the full running-power label", () => {
    render(<GlossaryText>러닝 파워 · 304 W</GlossaryText>, { wrapper: GlossaryProvider });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const term = screen.getByRole("button", { name: "러닝 파워 설명" });
    expect(term).toHaveTextContent("러닝 파워");
    fireEvent.focus(term);
    expect(screen.getByRole("tooltip")).toHaveTextContent("기기·서비스마다 다릅니다");
    expect(screen.getByRole("tooltip")).toHaveTextContent("사이클 파워·FTP와 직접 비교하기보다");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("보통 파워미터로 측정");
  });

  it("uses a dedicated English running-power explanation while retaining generic power", async () => {
    i18n.addResourceBundle("en", "termGlossary", en, true, true);
    await i18n.changeLanguage("en");
    try {
      render(<GlossaryText>Running power · 304 W / Power</GlossaryText>, { wrapper: GlossaryProvider });
      expect(screen.getAllByRole("button")).toHaveLength(2);
      const running = screen.getByRole("button", { name: "About Running power" });
      expect(running).toHaveTextContent("Running power");
      fireEvent.focus(running);
      expect(screen.getByRole("tooltip")).toHaveTextContent("Inputs and methods vary by device and service");
      fireEvent.blur(running);
      fireEvent.focus(screen.getByRole("button", { name: "About Power" }));
      expect(screen.getByRole("tooltip")).toHaveTextContent("In cycling it is usually measured by a power meter");
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  it("preserves numbers, empty values, and JSX without traversing interactive children", () => {
    const { rerender } = render(<GlossaryText>{182}</GlossaryText>, { wrapper: GlossaryProvider });
    expect(screen.getByText("182")).toBeInTheDocument();
    rerender(<GlossaryText>{null}</GlossaryText>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    rerender(<GlossaryText><a href="/settings">FTP</a></GlossaryText>);
    expect(screen.getByRole("link", { name: "FTP" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("uses the active English namespace rather than a Korean fallback", async () => {
    i18n.addResourceBundle("en", "termGlossary", en, true, true);
    await i18n.changeLanguage("en");
    try {
      render(<GlossaryText>CTL</GlossaryText>, { wrapper: GlossaryProvider });
      await waitFor(() => expect(screen.getByRole("button", { name: "About CTL" })).toBeInTheDocument());
      fireEvent.focus(screen.getByRole("button", { name: "About CTL" }));
      expect(screen.getByRole("tooltip")).toHaveTextContent(/roughly six weeks.*more weight.*does not directly measure fitness/i);
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  it("keeps shared wrappers plain outside the explicitly enabled page", () => {
    const { container } = render(<GlossaryText>FTP / 임계 페이스</GlossaryText>);
    expect(container.textContent).toBe("FTP / 임계 페이스");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.querySelector("[data-glossary-term]")).toBeNull();
  });
});

describe("InfoTip interactions", () => {
  it("uses separate design-system title and body text for structured explanations", () => {
    render(<InfoTip title="훈련 부하 점수" content="시간과 상대 강도로 계산합니다." label="TSS 설명">TSS</InfoTip>);
    const button = screen.getByRole("button", { name: "TSS 설명" });
    fireEvent.focus(button);
    const tooltip = screen.getByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveClass("ds-tooltip-content");
    const title = tooltip.querySelector(".ds-tooltip-content__title");
    expect(title?.tagName).toBe("STRONG");
    expect(title).toHaveClass("ds-text--body-medium");
    expect(title).toHaveStyle({ fontWeight: 600 });
    expect(title).toHaveTextContent("훈련 부하 점수");
    const body = tooltip.querySelector(".ds-tooltip-content__body");
    expect(body).toHaveClass("ds-text--body-small", "ds-text--tone-1");
    expect(body).toHaveTextContent("시간과 상대 강도로 계산합니다.");
    expect(tooltip).not.toHaveTextContent("—");
  });

  it("keeps the first focused/touched click open, supports a second click and Escape", async () => {
    const user = userEvent.setup();
    render(<InfoTip content="A useful definition" label="Explain FTP">FTP</InfoTip>);
    const button = screen.getByRole("button", { name: "Explain FTP" });
    // Mobile browsers focus a button before dispatching its first click.
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.tab();
    fireEvent.focus(button);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("supports keyboard focus and outside pointer dismissal", async () => {
    const user = userEvent.setup();
    render(<><InfoTip content="Definition" /><button>Elsewhere</button></>);
    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(screen.getByRole("button", { name: "Definition" })).toHaveAttribute("aria-describedby", tip.id);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("portals outside clipped containers and allows moving the pointer into the tooltip", () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<div style={{ overflow: "hidden" }}><InfoTip content="Definition" /></div>);
      const button = screen.getByRole("button");
      fireEvent.mouseEnter(button);
      const tip = screen.getByRole("tooltip");
      expect(container.contains(tip)).toBe(false);
      expect(tip.parentElement).toBe(document.body);
      expect(button).toHaveStyle({ minWidth: "var(--space-6)", minHeight: "var(--space-6)" });
      fireEvent.mouseLeave(button);
      fireEvent.mouseEnter(tip);
      act(() => { vi.advanceTimersByTime(150); });
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent.mouseLeave(tip);
      act(() => { vi.advanceTimersByTime(150); });
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("clamps both axes at the viewport edge", () => {
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if ((this as HTMLElement).tagName === "BUTTON") return { left: 1010, top: 740, bottom: 764, width: 24, height: 24 } as DOMRect;
      return { width: 232, height: 80 } as DOMRect;
    });
    try {
      render(<InfoTip content="Definition" />);
      fireEvent.mouseEnter(screen.getByRole("button"));
      expect(screen.getByRole("tooltip")).toHaveStyle({ left: "784px", top: "652px", position: "fixed" });
    } finally { bounds.mockRestore(); }
  });
});

describe("page glossary scope", () => {
  it("offers an explanation on every repeated term without adding icons", async () => {
    const { container } = render(<GlossaryProvider>
      <GlossaryText>FTP / FTP</GlossaryText><GlossaryText>FTP</GlossaryText>
    </GlossaryProvider>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "FTP 설명" })).toHaveLength(3));
    expect(container.textContent).toBe("FTP / FTPFTP");
    expect(container.querySelector("svg")).toBeNull();
    for (const button of screen.getAllByRole("button")) {
      fireEvent.click(button);
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
    }
  });

  it("closes the tooltip on scope change while preserving form state", async () => {
    function StatefulPage() {
      const [value, setValue] = useState("");
      return <><input aria-label="draft" value={value} onChange={event => setValue(event.target.value)} /><GlossaryText>FTP</GlossaryText></>;
    }
    const view = render(<GlossaryProvider scopeKey="/one"><StatefulPage /></GlossaryProvider>);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "keep this" } });
    fireEvent.click(screen.getAllByRole("button", { name: "FTP 설명" })[0]);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    view.rerender(<GlossaryProvider scopeKey="/two"><StatefulPage /></GlossaryProvider>);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("keep this");
  });
});

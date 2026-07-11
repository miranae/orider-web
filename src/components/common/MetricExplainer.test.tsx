import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MetricExplainerTrigger } from "./MetricExplainer";

vi.mock("../../services/analytics", () => ({ track: vi.fn() }));
import { track } from "../../services/analytics";

// 임계 300 sec/km(5'00"), 활동 페이스 352(5'52"), GAP 340(5'40")
const RUN_CTX = { paceSecPerKm: 352, gapSecPerKm: 340, thresholdPaceSecPerKm: 300, rtss: 64 };

function openSheet(metric: "gap" | "rtss" | "pace" = "gap", context = RUN_CTX) {
  render(
    <MetricExplainerTrigger metric={metric} context={context} sport="run">
      <span>5&apos;40&quot;</span>
    </MetricExplainerTrigger>,
  );
  fireEvent.click(screen.getByRole("button"));
}

describe("MetricExplainerTrigger — 탭 타깃", () => {
  beforeEach(() => vi.clearAllMocks());

  it("셀 전체가 버튼이며 최소 44px 높이를 갖는다 (ⓘ 아이콘 단독 히트영역 아님)", () => {
    render(
      <MetricExplainerTrigger metric="gap" context={RUN_CTX}>
        <span>내용</span>
      </MetricExplainerTrigger>,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveStyle({ minHeight: "44px" });
    expect(btn).toHaveTextContent("내용");
  });

  it("열면 or_metric_explainer_open 이벤트를 metric·sport 와 함께 보낸다", () => {
    openSheet("gap");
    expect(track).toHaveBeenCalledWith("or_metric_explainer_open", { metric: "gap", sport: "run" });
  });
});

describe("MetricExplainerSheet — 3단 구조", () => {
  beforeEach(() => vi.clearAllMocks());

  it("정의 단락과 개인화 해석을 함께 보여준다", () => {
    openSheet("gap");
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("평지 기준으로 환산한 페이스");
    // GAP 340 < pace 352 → uphill, diffSec 12
    expect(dialog).toHaveTextContent("12초 빨라요");
    expect(dialog).toHaveTextContent("오르막이 많았다");
  });

  it("근거(임계 페이스)가 없으면 해석 단락을 생략하고 정의만 보여준다", () => {
    render(
      <MetricExplainerTrigger metric="rtss" context={{ rtss: 64, paceSecPerKm: 340 }}>
        <span>64</span>
      </MetricExplainerTrigger>,
    );
    fireEvent.click(screen.getByRole("button"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("몸에 준 부담의 크기");
    expect(dialog).not.toHaveTextContent("내일은 가볍게");
  });

  it("rTSS 해설은 IF 기반 회복 안내를 담는다", () => {
    // 임계 300 / 페이스 280 → IF 1.07 (hard)
    openSheet("rtss", { ...RUN_CTX, paceSecPerKm: 280 });
    expect(screen.getByRole("dialog")).toHaveTextContent("내일은 가볍게 달리거나 쉬는 게 좋아요");
  });

  it("dialog 는 제목과 aria-labelledby 로 연결된다", () => {
    openSheet("gap");
    const dialog = screen.getByRole("dialog");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy!)).toHaveTextContent("GAP");
  });

  it("매뉴얼 링크는 존재하는 챕터를 가리킨다", () => {
    openSheet("rtss");
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/web-manual/ch07-training.html");
  });
});

describe("MetricExplainerSheet — 닫기 동작", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ESC 로 닫힌다", () => {
    openSheet("gap");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("닫기 버튼으로 닫히고 포커스가 트리거로 돌아온다", () => {
    openSheet("gap");
    fireEvent.click(screen.getByLabelText("닫기"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("button"));
  });

  it("스크림 클릭으로 닫히지만 시트 내부 클릭은 닫지 않는다", () => {
    openSheet("gap");
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

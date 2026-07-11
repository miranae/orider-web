import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MilestoneCelebration from "./MilestoneCelebration";

function setup(id: "first_5km" | "first_full" = "first_5km") {
  const onClose = vi.fn();
  render(<MilestoneCelebration milestoneId={id} onClose={onClose} />);
  return { onClose };
}

describe("MilestoneCelebration", () => {
  it("마일스톤별 축하 문구를 보여준다", () => {
    setup("first_5km");
    expect(screen.getByRole("dialog")).toHaveTextContent("첫 5km 완주!");
  });

  it("풀코스 축하도 지원", () => {
    setup("first_full");
    expect(screen.getByRole("dialog")).toHaveTextContent("첫 풀코스 완주!");
  });

  it("모달 접근성 속성 + 제목 연결", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(document.getElementById(labelledBy!)).toHaveTextContent("완주");
  });

  it("CTA 클릭으로 닫힌다 (celebrated 갱신 트리거)", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalled();
  });

  it("ESC 로 닫힌다", () => {
    const { onClose } = setup();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("스크림 클릭은 닫고 패널 내부 클릭은 닫지 않는다", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("첫 포커스가 모달 안으로 들어간다", () => {
    setup();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });
});

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import enBoard from "../../i18n/resources/en/board.json";
import { ReportContentModal } from "./ReportContentModal";

const preview = { title: "A long ride", authorNickname: "Rider", createdAt: 1792195200000 };

beforeEach(async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  i18n.addResourceBundle("en", "board", enBoard, true, true);
  await i18n.changeLanguage("ko");
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await i18n.changeLanguage("ko");
});

describe("ReportContentModal", () => {
  it("portals above a page stacking context and keeps dismissal and focus restoration", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const { unmount } = render(<div data-testid="page-stack" style={{ position: "relative", zIndex: 0, overflow: "hidden" }}>
      <ReportContentModal targetType="post" preview={preview} submitting={false} onClose={close} onSubmit={vi.fn()} />
    </div>);
    const dialog = screen.getByRole("dialog");
    expect(screen.getByTestId("page-stack")).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("labels the dialog and fields, focuses inside, traps Tab, and restores focus and scrolling", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const close = vi.fn();
    const { unmount } = render(<ReportContentModal targetType="post" preview={preview} submitting={false} onClose={close} onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "게시글 신고" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(i18n.t("report.description", { ns: "board" }));
    const closeButton = screen.getByRole("button", { name: "신고 창 닫기" });
    expect(closeButton).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("group", { name: "신고 사유" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "스팸" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "추가 설명" })).toHaveAccessibleDescription("0/500");
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "신고 접수" })).toHaveFocus();
    await user.tab();
    expect(closeButton).toHaveFocus();
    trigger.focus();
    expect(closeButton).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(document.querySelector('[aria-hidden="true"][tabindex="-1"]')!);
    expect(close).toHaveBeenCalledTimes(3);
    unmount();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    trigger.remove();
  });

  it("supports radio keyboard selection and submits the selected reason and explanation once", async () => {
    const user = userEvent.setup();
    let resolve!: () => void;
    const submit = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const close = vi.fn();
    render(<ReportContentModal targetType="comment" preview={preview} submitting={false} onClose={close} onSubmit={submit} />);
    await user.click(screen.getByRole("radio", { name: "스팸" }));
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "욕설/괴롭힘" })).toBeChecked();
    await user.type(screen.getByRole("textbox", { name: "추가 설명" }), "검토 부탁드립니다.");
    const button = screen.getByRole("button", { name: "신고 접수" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(submit).toHaveBeenCalledExactlyOnceWith("abuse", "검토 부탁드립니다.");
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("textbox")).toBeDisabled();
    screen.getAllByRole("radio").forEach((radio) => expect(radio).toBeDisabled());
    await user.keyboard("{Escape}{Tab}");
    expect(screen.getByRole("dialog")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    fireEvent.click(screen.getByRole("button", { name: "신고 창 닫기" }));
    fireEvent.click(document.querySelector('[aria-hidden="true"][tabindex="-1"]')!);
    expect(close).not.toHaveBeenCalled();
    await act(async () => resolve());
    expect(screen.getByRole("button", { name: "신고 접수" })).toBeEnabled();
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "신고 창 닫기" })).toHaveFocus();
  });

  it("blocks dismissal while externally submitting and re-enables it afterward", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const props = { targetType: "post" as const, preview, onClose: close, onSubmit: vi.fn() };
    const { rerender } = render(<ReportContentModal {...props} submitting />);
    await user.keyboard("{Escape}{Tab}");
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveFocus();
    rerender(<ReportContentModal {...props} submitting={false} />);
    await user.tab();
    expect(screen.getByRole("button", { name: "신고 창 닫기" })).toHaveFocus();
    rerender(<ReportContentModal {...props} submitting />);
    expect(screen.getByRole("dialog")).toHaveFocus();
    rerender(<ReportContentModal {...props} submitting={false} />);
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the entered content after failure and permits retry", async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(undefined);
    render(<ReportContentModal targetType="post" preview={preview} submitting={false} onClose={vi.fn()} onSubmit={submit} />);
    await user.type(screen.getByRole("textbox"), "추가 내용");
    await user.click(screen.getByRole("button", { name: "신고 접수" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("신고 접수에 실패했습니다.");
    expect(screen.getByRole("textbox")).toHaveValue("추가 내용");
    await user.click(screen.getByRole("button", { name: "신고 접수" }));
    expect(submit).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders English labels and locale-aware timestamps", async () => {
    await i18n.changeLanguage("en");
    render(<ReportContentModal targetType="post" preview={preview} submitting={false} onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: i18n.t("report.title", { ns: "board", target: i18n.t("report.target.post", { ns: "board" }) }) })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: enBoard["report.note"] })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByText(new Date(preview.createdAt).toLocaleString("en"))).toBeInTheDocument();
  });
});

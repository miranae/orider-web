import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MeetingInviteShare, { meetingInviteUrl } from "./MeetingInviteShare";
const props = { groupId: "club", eventId: "event", title: "주말 라이딩", date: "2026-11-22", time: "09:00", place: "한강", en: false };
afterEach(() => vi.unstubAllGlobals());
describe("meeting invitations", () => {
  it("creates an encoded compact link without session information", () => {
    expect(meetingInviteUrl("https://orider.co.kr/", "a/b", "c?d", true)).toBe("https://orider.co.kr/en/m/a%2Fb/c%3Fd");
  });
  it("copies only the link when requested", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MeetingInviteShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/ko/m/club/event`));
    expect(await screen.findByText("초대 링크를 복사했어요.")).toBeInTheDocument();
  });
  it("opens the native share sheet with invitation details", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    render(<MeetingInviteShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: props.title, text: expect.stringContaining("2026-11-22 09:00 · 한강"), url: `${window.location.origin}/ko/m/club/event` })));
  });
  it("copies the full invitation when native sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<MeetingInviteShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "공유" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("클럽 가입 및 참가 신청")));
  });
  it("keeps a selectable link when clipboard permission is denied", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<MeetingInviteShare {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "초대 링크 복사" }));
    expect(await screen.findByText("아래 링크를 길게 누르거나 선택해 복사해주세요.")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `${window.location.origin}/ko/m/club/event`);
  });
});

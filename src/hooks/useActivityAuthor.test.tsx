import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useActivityAuthor } from "./useActivityAuthor";
import { resetPublicProfileCache } from "../services/publicProfileCache";
import { getPublicUserProfile } from "../services/publicProfiles";

vi.mock("../services/publicProfiles", () => ({
  getPublicUserProfile: vi.fn(),
}));

vi.mock("../services/errorLogger", () => ({
  logClientError: vi.fn(),
}));

function Probe({ nickname, profileImage }: { nickname?: string | null; profileImage?: string | null }) {
  const author = useActivityAuthor({ userId: "user-1", nickname, profileImage });
  return <div data-testid="author">{`${author.nickname ?? "<없음>"}|${author.profileImage ?? "<없음>"}`}</div>;
}

describe("useActivityAuthor", () => {
  beforeEach(() => {
    resetPublicProfileCache();
    vi.mocked(getPublicUserProfile).mockReset();
  });

  it("문서에 이름이 없어도 프로필에서 해석한다 (앱 업로드분)", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue({ id: "user-1", nickname: "심새롬", photoURL: "https://img/1.png" });

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("author").textContent).toBe("심새롬|https://img/1.png"));
  });

  it("프로필이 정본 — 문서에 복제된 옛 이름을 덮는다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue({ id: "user-1", nickname: "새 이름", photoURL: null });

    render(<Probe nickname="옛 이름" />);

    await waitFor(() => expect(screen.getByTestId("author").textContent).toBe("새 이름|<없음>"));
  });

  it("프로필이 없으면 문서 복제값으로 폴백한다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue(null);

    render(<Probe nickname="문서 이름" profileImage="https://img/doc.png" />);

    await waitFor(() => expect(screen.getByTestId("author").textContent).toBe("문서 이름|https://img/doc.png"));
  });

  it("양쪽 다 없으면 null — 폴백 문구는 호출부가 고른다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue(null);

    render(<Probe />);

    await waitFor(() => expect(screen.getByTestId("author").textContent).toBe("<없음>|<없음>"));
  });

  it("빈 문자열 이름은 '없음' 으로 취급한다", async () => {
    vi.mocked(getPublicUserProfile).mockResolvedValue({ id: "user-1", nickname: "   ", photoURL: null });

    render(<Probe nickname="  " />);

    await waitFor(() => expect(screen.getByTestId("author").textContent).toBe("<없음>|<없음>"));
  });
});

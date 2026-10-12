import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ClubScopeFeed from "./ClubScopeFeed";
import { useMyGroups, useGroupMemberRole } from "../../hooks/useGroup";
import { useGroupPosts } from "../../hooks/useGroupPosts";
import { useClubUpcomingEvents } from "../../hooks/useClubUpcomingEvents";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../LocalizedLink", () => ({ LocalizedLink: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a> }));
vi.mock("../../hooks/useGroup", () => ({ useMyGroups: vi.fn(), useGroupMemberRole: vi.fn() }));
vi.mock("../../hooks/useGroupPosts", () => ({ useGroupPosts: vi.fn() }));
vi.mock("../../hooks/useClubUpcomingEvents", () => ({ useClubUpcomingEvents: vi.fn() }));
const retry = vi.fn();
const group = { id: "a", name: "Club A", creatorId: "u" };

describe("ClubScopeFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useMyGroups).mockReturnValue({ groups: [group], loading: false, error: null, retry } as ReturnType<typeof useMyGroups>);
    vi.mocked(useGroupMemberRole).mockReturnValue({ role: "member", loading: false });
    vi.mocked(useGroupPosts).mockReturnValue({ posts: [], loading: false, error: null, retry });
    vi.mocked(useClubUpcomingEvents).mockReturnValue({ events: [], loading: false, error: null, retry });
  });
  it("offers existing discovery and training routes when there are no clubs", () => {
    vi.mocked(useMyGroups).mockReturnValue({ groups: [], loading: false, error: null, retry });
    render(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.getByText("feed.club.noClubs")).toBeInTheDocument();
    expect(screen.getByText("feed.club.findEvents")).toHaveAttribute("href", "/events");
    expect(screen.getByText("feed.club.findClubs")).toHaveAttribute("href", "/groups");
    expect(screen.getByText("feed.club.myTraining")).toHaveAttribute("href", "/log");
  });
  it("shows a retry instead of no clubs when membership loading fails", () => {
    vi.mocked(useMyGroups).mockReturnValue({ groups: [], loading: false, error: new Error("failed"), retry });
    render(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.queryByText("feed.club.noClubs")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("feed.error.retry"));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("distinguishes loading, errors and empty sections", () => {
    vi.mocked(useGroupPosts).mockReturnValue({ posts: [], loading: true, error: null, retry });
    const { rerender } = render(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("feed.loading");
    expect(screen.getByText("feed.club.noEvents")).toBeInTheDocument();
    expect(screen.queryByText("feed.club.noPosts")).not.toBeInTheDocument();
    vi.mocked(useGroupPosts).mockReturnValue({ posts: [], loading: false, error: new Error("posts failed"), retry });
    rerender(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("feed.club.noPosts")).not.toBeInTheDocument();
    vi.mocked(useGroupPosts).mockReturnValue({ posts: [], loading: false, error: null, retry });
    rerender(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.getByText("feed.club.noPosts")).toBeInTheDocument();
  });
  it("canonicalizes an implicit default club in the URL using replacement", () => {
    const onClubChange = vi.fn();
    render(<ClubScopeFeed uid="u" onClubChange={onClubChange} />);
    expect(onClubChange).toHaveBeenCalledWith("a", true);
  });
  it("remounts group-bound state when changing clubs", () => {
    vi.mocked(useMyGroups).mockReturnValue({ groups: [group, { ...group, id: "b", name: "Club B" }], loading: false, error: null, retry } as ReturnType<typeof useMyGroups>);
    vi.mocked(useGroupPosts).mockImplementation((groupId) => {
      const [mountedGroupId] = useState(groupId);
      return { posts: [{ id: "p", content: `News ${mountedGroupId}`, authorId: "u", authorName: "Rider", kind: "post", createdAt: 0 }], loading: false, error: null, retry };
    });
    const changeClub = vi.fn();
    const { rerender } = render(<ClubScopeFeed uid="u" clubId="a" onClubChange={changeClub} />);
    expect(screen.getByText("News a")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b" } });
    expect(changeClub).toHaveBeenCalledWith("b");
    rerender(<ClubScopeFeed uid="u" clubId="b" onClubChange={changeClub} />);
    expect(screen.getByText("News b")).toBeInTheDocument();
    expect(screen.queryByText("News a")).not.toBeInTheDocument();
  });
  it("shows event query failures with retry and no empty-events message", () => {
    vi.mocked(useClubUpcomingEvents).mockReturnValue({ events: [], loading: false, error: new Error("events failed"), retry });
    render(<ClubScopeFeed uid="u" clubId="a" onClubChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText("feed.club.noEvents")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("feed.error.retry"));
    expect(retry).toHaveBeenCalledOnce();
  });
  it("links items to the original club and event", () => {
    vi.mocked(useGroupPosts).mockReturnValue({ posts: [{ id: "p", content: "Post", authorId: "u", authorName: "Rider", kind: "post", createdAt: 0 }], loading: false, error: null, retry });
    vi.mocked(useClubUpcomingEvents).mockReturnValue({ events: [{ id: "e", name: "Ride", startTime: 0 }], loading: false, error: null, retry });
    render(<ClubScopeFeed uid="u" onClubChange={vi.fn()} />);
    expect(screen.getByText("Post")).toHaveAttribute("href", "/group/a");
    expect(screen.getByText("Ride")).toHaveAttribute("href", "/event/e");
  });
});

import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import { firestore } from "../../services/firebase";
import ChallengeFeed from "./ChallengeFeed";

describe("popular course request bounds", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("requests the four server-sorted popular courses and renders their navigation", async () => {
    // 목록은 REST runQuery(projection)로 읽는다(#3235). 테스트용 Firestore 에 프로젝트를 붙인다.
    Object.assign((firestore as unknown as { app: { options: Record<string, unknown> } }).app.options, { projectId: "test" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{
      document: {
        name: "projects/test/databases/(default)/documents/courses/course",
        fields: { name: { stringValue: "Popular course" }, visibility: { stringValue: "public" }, distance: { integerValue: "1000" }, likeCount: { integerValue: "10" } },
      },
    }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithProviders(<ChallengeFeed part="courses" />);
    expect(await screen.findByRole("link", { name: /Popular course/ })).toHaveAttribute("href", "/ko/course/course");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.structuredQuery.limit).toBe(4);
    expect(body.structuredQuery.orderBy[0]).toEqual({ field: { fieldPath: "likeCount" }, direction: "DESCENDING" });
  });
});

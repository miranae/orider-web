import { renderHook } from "@testing-library/react";
import { onSnapshot } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";
import { setCollectionDocs } from "../__tests__/mocks/firebase";
import { useCollection, where } from "./useFirestore";

describe("useCollection", () => {
  it("does not resubscribe when inline constraints serialize to the same query", () => {
    setCollectionDocs("comments", [{ id: "comment-1", deletedAt: null }]);

    const { rerender } = renderHook(
      ({ tick }) => {
        void tick;
        return useCollection("comments", [where("deletedAt", "==", null)]);
      },
      { initialProps: { tick: 1 } },
    );

    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(1);

    rerender({ tick: 2 });

    expect(vi.mocked(onSnapshot)).toHaveBeenCalledTimes(1);
  });
});

import { render, screen } from "@testing-library/react";
import ActivityRouteThumbnail from "./ActivityRouteThumbnail";
const m = vi.hoisted(() => ({ maps: {} as Record<string, null>, failed: false }));
beforeEach(() => { m.maps = {}; m.failed = false; });
vi.mock("../../hooks/usePublicActivityMaps", () => ({ usePublicActivityMaps: () => m }));
it("never renders cached raw geometry or image while public map is unverified", () => {
 const { container } = render(<ActivityRouteThumbnail activityId="a" userId="owner" polyline="RAW_PRIVATE_ROUTE" mapImageUrl="https://raw.test/private.png" visibility="everyone" />);
 expect(container.querySelector("img,canvas")).toBeNull(); expect(container.innerHTML).not.toContain("RAW_PRIVATE_ROUTE"); expect(container.innerHTML).not.toContain("raw.test"); expect(container.querySelector("[data-map-thumbnail-skeleton]")).toBeInTheDocument();
});

it.each([false, true])("resolved unavailable/failed=%s becomes an accessible notice without cached geometry", failed => {
 m.failed = failed; m.maps = failed ? {} : { a: null };
 const { container, rerender } = render(<ActivityRouteThumbnail activityId="a" userId="owner" polyline="RAW_PRIVATE_ROUTE" mapImageUrl="https://raw.test/private.png" />);
 expect(screen.getByRole("status")).toBeInTheDocument();
 expect(screen.queryByRole("img")).not.toBeInTheDocument();
 expect(container.querySelector("img,canvas")).toBeNull();
 expect(container.innerHTML).not.toContain("RAW_PRIVATE_ROUTE");
 expect(container.innerHTML).not.toContain("raw.test");
 // A new request/offscreen state reserves layout again; old resolution must not survive it.
 m.maps = {}; m.failed = false;
 rerender(<ActivityRouteThumbnail activityId="a" userId="owner" polyline="RAW_PRIVATE_ROUTE" />);
 expect(screen.queryByRole("status")).not.toBeInTheDocument();
 expect(container.querySelector("[data-map-thumbnail-skeleton]")).toBeInTheDocument();
});

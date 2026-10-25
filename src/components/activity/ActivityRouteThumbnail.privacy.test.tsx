import { render, screen } from "@testing-library/react";
import ActivityRouteThumbnail from "./ActivityRouteThumbnail";
const m = vi.hoisted(() => ({ maps: {}, failed: false }));
vi.mock("../../hooks/usePublicActivityMaps", () => ({ usePublicActivityMaps: () => m }));
it("never renders cached raw geometry or image while public map is unverified", () => {
 const { container } = render(<ActivityRouteThumbnail activityId="a" userId="owner" polyline="RAW_PRIVATE_ROUTE" mapImageUrl="https://raw.test/private.png" visibility="everyone" />);
 expect(container.querySelector("img,canvas")).toBeNull(); expect(container.innerHTML).not.toContain("RAW_PRIVATE_ROUTE"); expect(container.innerHTML).not.toContain("raw.test"); expect(screen.getByRole("img")).toBeInTheDocument();
});

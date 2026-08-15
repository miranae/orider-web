import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { statSync } from "node:fs";
import { join } from "node:path";
import { logClientError } from "../services/errorLogger";
import { CommunityLogo, KOREAN_CYCLING_COMMUNITIES } from "./DashboardPage";

vi.mock("../services/errorLogger", () => ({ logClientError: vi.fn() }));

describe("Korean cycling community logos", () => {
  beforeEach(() => {
    vi.mocked(logClientError).mockClear();
  });

  it("uses a vendored image for every community", () => {
    expect(KOREAN_CYCLING_COMMUNITIES).toHaveLength(6);

    for (const community of KOREAN_CYCLING_COMMUNITIES) {
      expect(community.logo).toMatch(/^\/images\/communities\//);
      expect(statSync(join(process.cwd(), "public", community.logo)).size).toBeGreaterThan(0);
    }
  });

  it("falls back to the text badge when an image cannot load", () => {
    const { container, getByText } = render(
      <CommunityLogo
        name="도싸"
        badge="도"
        logo="/images/communities/dossa.webp"
        logoBg="white"
      />,
    );

    const image = container.querySelector("img");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("alt", "");

    fireEvent.error(image!);
    fireEvent.error(image!);

    expect(container.querySelector("img")).toBeNull();
    expect(getByText("도")).toBeInTheDocument();
    expect(logClientError).toHaveBeenCalledTimes(1);
    expect(logClientError).toHaveBeenCalledWith(
      "DashboardPage.communityLogoLoad",
      expect.any(Error),
      { communityName: "도싸", logo: "/images/communities/dossa.webp" },
    );
  });
});

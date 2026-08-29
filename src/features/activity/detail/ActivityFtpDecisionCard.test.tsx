import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "../../../__tests__/utils/renderWithProviders";
import { ActivityFtpDecisionCard } from "./ActivityFtpDecisionCard";

const mocks = vi.hoisted(() => ({ decision: null as null | Record<string, unknown> }));
vi.mock("../../../hooks/useBikeFtpDecision", () => ({
  useBikeFtpDecision: () => ({ decision: mocks.decision }),
}));

describe("ActivityFtpDecisionCard", () => {
  it("only discovers the decision and links to Fitness", () => {
    mocks.decision = {
      decisionId: "bike-ftp-1234567890abcdef1234567890abcdef",
      status: "actionable",
      candidate: { currentFtp: 250, ftp: 265 },
    };
    renderWithProviders(<ActivityFtpDecisionCard uid="uid-1" activityId="activity-1" enabled />);
    expect(screen.getByRole("link", { name: "Fitness에서 검토" }))
      .toHaveAttribute("href", "/ko/fitness?sport=bike&decisionId=bike-ftp-1234567890abcdef1234567890abcdef");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders nothing outside the owner bike boundary", () => {
    const { container } = renderWithProviders(<ActivityFtpDecisionCard uid="uid-1" activityId="activity-1" enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

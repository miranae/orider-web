import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ParticipantTable, { type LocationData } from "./ParticipantTable";
import eventStrings from "../../i18n/resources/ko/event.json";

const location: LocationData = {
  uid: "rider", lat: 0, lng: 0, speed: 0, distance: 1000, status: "FINISHED",
  displayName: "QA Rider", bib: 1, category: "A", rank: 1, overallRank: 1,
  lastCp: 0, geohash: null,
};

describe("live participant result pending", () => {
  it("keeps legacy FINISHED labels when pending mode is not requested", () => {
    render(<ParticipantTable locations={[location]} selectedUid={null} onSelectParticipant={() => {}} />);
    expect(screen.getByText(eventStrings["stats.finished"])).toBeInTheDocument();
    expect(screen.getByText("1", { selector: "td" })).toBeInTheDocument();
  });

  it("shows an unverified stop without a finish rank in pending mode", () => {
    render(<ParticipantTable locations={[location]} pendingFinish selectedUid={null} onSelectParticipant={() => {}} />);
    expect(screen.getByText(eventStrings["dashboard.status.resultPending"])).toBeInTheDocument();
    expect(screen.queryByText(eventStrings["stats.finished"])).toBeNull();
    expect(screen.queryByText("1", { selector: "td" })).toBeNull();
  });
});

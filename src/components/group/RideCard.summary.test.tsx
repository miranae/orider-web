import { act, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import i18n from "i18next";
import enGroup from "../../i18n/resources/en/group.json";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../__tests__/utils/renderWithProviders";
import type { GroupRideSummary } from "../../hooks/useGroupRides";
import RideCard from "./RideCard";

const ride: GroupRideSummary = {
  groupRideId: "ride", startTime: 1792105200000, participantCount: 3, totalDistance: 129600,
  activities: [0, 1, 2].map(index => ({ id: String(index), userId: String(index), nickname: `Rider ${index}`, profileImage: null, startTime: 1792105200000, summary: { distance: 42000 + index * 1200, ridingTimeMillis: 7200000 + index * 60000, elevationGain: 300 + index * 50, relativeEffort: null } })),
};
function show(value = ride, language = "ko") {
  renderWithProviders(<Routes><Route path="/:lang/club/:groupId/rides" element={<RideCard ride={value} />} /></Routes>, { route: `/${language}/club/club/rides` });
}

describe("RideCard summary definitions", () => {
  it("identifies summed participant distance separately from averaged time and elevation", () => {
    show();
    expect(screen.getByText("합산 이동거리")).toHaveTextContent("합산 이동거리 129.6 km");
    expect(screen.getByText("평균 활동시간")).toHaveTextContent("평균 활동시간 2h 1m");
    expect(screen.getByText("평균 획득고도")).toHaveTextContent("평균 획득고도 350 m");
  });

  it("labels three activity records without counting a repeat rider twice in the member preview", () => {
    show({ ...ride, participantCount: 6, activities: [ride.activities[0], { ...ride.activities[1], userId: ride.activities[0].userId, nickname: ride.activities[0].nickname }, ride.activities[2]] });
    expect(screen.getByText("활동 기록 6개")).toBeInTheDocument();
    const preview = screen.getByRole("group", { name: "참여 회원 미리보기" });
    expect(preview.children).toHaveLength(2);
    expect(screen.queryByText("6명 참가")).toBeNull();
    expect(screen.queryByText("+2")).toBeNull();
  });

  it.each(["ko", "en"])("always includes the ride year with %s locale formatting", async language => {
    i18n.addResourceBundle("en", "group", enGroup, true, true);
    try {
      await act(async () => { await i18n.changeLanguage(language); });
      show({ ...ride, startTime: new Date(2023, 9, 10).getTime() }, language);
      const expected = new Date(2023, 9, 10).toLocaleDateString(language === "ko" ? "ko-KR" : "en-US", { year: "numeric", month: language === "ko" ? "numeric" : "short", day: "numeric" });
      expect(screen.getByText(expected)).toBeInTheDocument();
      expect(screen.queryByText("3명 참가")).toBeNull();
      expect(screen.getByText(language === "ko" ? "활동 기록 3개" : "3 activity records")).toBeInTheDocument();
    } finally {
      await act(async () => { await i18n.changeLanguage("ko"); });
    }
  });

  it("retains explicit server-average values when supplied", () => {
    show({ ...ride, averageRidingTimeMillis: 3600000, averageElevationGain: 240 });
    expect(screen.getByText("평균 활동시간")).toHaveTextContent("평균 활동시간 1h 0m");
    expect(screen.getByText("평균 획득고도")).toHaveTextContent("평균 획득고도 240 m");
  });
});

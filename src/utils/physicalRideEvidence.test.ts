import cases from "@shared/training/physicalRideEvidence.fixture.json";
import type { Activity } from "@shared/types";
import { acceptedPhysicalActivities } from "./estimateTSS";

it.each(cases)("서버와 같은 대표 계약: $name", ({ rows, winner }) => {
  expect(acceptedPhysicalActivities(rows as unknown as Activity[]).map(row => row.id)).toEqual([winner]);
  // 계정 FTP는 표시 부하 추정에만 쓰이며 대표를 바꾸지 않는다.
  expect(acceptedPhysicalActivities(rows as unknown as Activity[], 250).map(row => row.id)).toEqual([winner]);
});

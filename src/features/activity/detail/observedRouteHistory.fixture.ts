import type { Activity } from "@shared/types";
import { routeFixture } from "../../../services/activityRouteEvidence.fixture";
export const observedHistoryActivity = (id: string, day = 0): Activity => ({ id, userId: "owner", type: "Ride", startTime: 1700000000000 + day * 86400000, endTime: 1700003600000 + day * 86400000, summary: { distance: 12000, movingTimeSec: 3300, elapsedTimeMillis: 3600000 }, source: "orider" }) as Activity;
export const observedHistoryRoute = (id: string, reverse = false) => routeFixture(id, reverse);

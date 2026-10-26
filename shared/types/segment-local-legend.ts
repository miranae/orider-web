export interface SegmentLocalLegend {
  windowStartMs: number;
  windowEndMs: number;
  windowWeeks: 13;
  population: "authorized_native_outdoor_bike";
  coverage: "complete" | "partial";
  scannedCount: number;
  scanLimit: 500;
  riderCount: number;
  totalEfforts: number;
  leader: { userId: string; nickname: string; effortCount: number } | null;
  minimumEfforts: 3;
  globalRankAvailable: false;
}

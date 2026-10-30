import type { SegmentLocalLegend } from './segment-local-legend';
export interface SegmentLegendProgressRequest {
  segmentId: string; action: 'start' | 'advance' | 'finalize' | 'status'; runId?: string; expectedVersion?: number;
}
export interface SegmentLegendProgressResponse {
  runId: string; version: number;
  state: 'census' | 'ready' | 'complete' | 'limit' | 'expired';
  censusAsOf: number; finalAsOf: number | null; windowEndMs: number; expiresAt: number;
  preparationOnly: true; steps: number;
  limits: { candidates: 2000; documentReads: 30000; inputBytes: 33554432; milliseconds: 90000 };
  validation: { documentReads: number; inputBytes: number; elapsedMs: number } | null;
  reason: 'candidate_limit' | 'document_limit' | 'byte_limit' | 'time_limit' | null;
  result: (Omit<SegmentLocalLegend, 'scanLimit'> & { scanLimit: 2000 }) | null;
}

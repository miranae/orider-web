import parity from "../../../src/features/coach/__fixtures__/rider-insight-parity.json";

export function useCoachRiderInsight() {
  return { insight: parity.cardEnvelope.data, loading: false, unavailable: false };
}

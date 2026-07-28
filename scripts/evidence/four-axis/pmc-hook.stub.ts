import parity from "../../../src/features/coach/__fixtures__/pmc-fitness-parity.json";

export function useCoachPmcInsight() {
  return { insight: parity.cardEnvelope.data, loading: false, unavailable: false };
}

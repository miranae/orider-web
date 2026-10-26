import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useEffect, useRef, useState } from "react";
import { loadActivityNarrativeHistory, type NarrativeHistory } from "../services/activityNarrativeHistory";
import { captureActivityNarrativeSession, isActivityNarrativeAccessRevoked } from "../services/activityNarrativeSession";
import type { NarrativeLang } from "./useActivityNarrative";
export function useActivityNarrativeHistory(activityId: string | null, lang: NarrativeLang, enabled: boolean) {
  const services = useFirebaseServices();
  const session = captureActivityNarrativeSession(services);
  const scope = `${activityId}:${lang}:${session.key}:${enabled}`;
  const [state, setState] = useState<{ scope: string; list: NarrativeHistory | null; selected: NarrativeHistory["selected"]; busy: boolean; failed: boolean; accessRevoked: boolean }>({ scope, list: null, selected: null, busy: false, failed: false, accessRevoked: false });
  const generation = useRef(0), busy = useRef(false);
  useEffect(() => { generation.current++; busy.current = false; return () => { generation.current++; }; }, [scope]);
  const current = state.scope === scope && session.isCurrent() ? state : { scope, list: null, selected: null, busy: false, failed: false, accessRevoked: false };
  async function load(revisionId?: string, cursor?: string) {
    if (!enabled || !activityId || busy.current) return;
    const token = generation.current; busy.current = true;
    setState({ ...current, busy: true, failed: false, accessRevoked: false });
    try {
      const response = await loadActivityNarrativeHistory(activityId, lang, revisionId, cursor, services);
      if (token !== generation.current || !session.isCurrent()) return;
      if (revisionId && !response.selected) throw Error("missing_narrative_revision");
      setState({ scope, busy: false, failed: false, accessRevoked: false, selected: revisionId ? response.selected : current.selected,
        list: revisionId ? current.list : { ...response, items: cursor ? [...(current.list?.items ?? []), ...response.items] : response.items } });
    } catch (error) {
      if (token === generation.current && session.isCurrent()) setState({ ...current, selected: isActivityNarrativeAccessRevoked(error) ? null : current.selected, list: isActivityNarrativeAccessRevoked(error) ? null : current.list, busy: false, failed: true, accessRevoked: isActivityNarrativeAccessRevoked(error) });
    } finally { if (token === generation.current) busy.current = false; }
  }
  return { ...current, load, clear: () => { generation.current++; busy.current = false; setState({ ...current, selected: null, busy: false, failed: false, accessRevoked: false }); } };
}

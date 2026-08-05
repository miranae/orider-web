import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../services/firebase";
import { getRuntimeConfig } from "../services/runtimeConfig";
import { track } from "../services/analytics";
import { logClientError } from "../services/errorLogger";

export function useStrava() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectStrava = (returnTo?: string) => {
    const { stravaClientId, stravaRedirectUri } = getRuntimeConfig();
    if (!stravaClientId || !stravaRedirectUri) {
      setError("Strava configuration is missing");
      throw new Error("Strava configuration is missing");
    }

    const nonce = crypto.randomUUID();
    sessionStorage.setItem("strava_state", nonce);
    if (returnTo) sessionStorage.setItem("strava_return_to", returnTo);

    // state = "returnOrigin|nonce" → 프록시가 파싱하여 원래 출처로 리다이렉트
    const returnOrigin = window.location.origin;
    const state = `${returnOrigin}|${nonce}`;

    const params = new URLSearchParams({
      client_id: stravaClientId,
      redirect_uri: stravaRedirectUri,
      response_type: "code",
      scope: "read,activity:read_all",
      state,
    });

    window.location.href = `https://www.strava.com/oauth/authorize?${params}`;
  };

  const exchangeCode = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaExchangeToken");
      const result = await fn({ code });
      return result.data as { athleteId: number; firstname: string; lastname: string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Token exchange failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const startMigration = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaQueueEnqueue");
      const result = await fn({});
      return result.data as { jobId: string; queuePosition: number };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Migration start failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const cancelMigration = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaQueueCancel");
      await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cancel failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const getStreams = useCallback(async (stravaActivityId: number) => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaGetActivityStreams");
      const result = await fn({ stravaActivityId });
      // Firebase callable 응답은 보통 `data`로 오지만, 런타임이 섞인 배포에서는
      // 같은 payload가 `result`로 노출될 수 있다. 성공한 스트림 응답이
      // undefined로 바뀌어 분석 없음 상태가 되는 것을 막는다.
      const callableResult = result as { data?: unknown; result?: unknown };
      return (callableResult.data ?? callableResult.result) as Record<string, unknown>;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stream fetch failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnectStrava = async (operationId: string) => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaDisconnect");
      await fn({ operationId, source: "web" });
      track("strava_disconnect_success", { operationId, source: "web" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Disconnect failed";
      setError(msg);
      track("strava_disconnect_failure", { operationId, source: "web" });
      logClientError(
        "useStrava.disconnectStrava",
        new Error("Strava disconnect callable failed"),
        { operationId, source: "web" },
      );
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const deleteUserData = async (streamsOnly = false) => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaDeleteUserData", { timeout: 300_000 });
      const result = await fn({ streamsOnly });
      return result.data as { deletedActivities: number; deletedStreams: number };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const verifyMigration = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaMigrationVerify", { timeout: 300_000 });
      const result = await fn();
      return result.data as {
        totalStrava: number;
        totalImported: number;
        missingActivityCount: number;
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Verification failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const fixMigration = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fn = httpsCallable(functions, "stravaMigrationFix");
      const result = await fn({});
      return result.data as { activitiesImported: number };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fix failed";
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    connectStrava,
    exchangeCode,
    startMigration,
    cancelMigration,
    getStreams,
    disconnectStrava,
    deleteUserData,
    verifyMigration,
    fixMigration,
  };
}

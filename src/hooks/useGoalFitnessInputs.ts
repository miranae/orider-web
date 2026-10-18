import { z } from "zod";
import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { useFirebaseServices } from "../contexts/FirebaseServicesContext";
import { useAuth } from "../contexts/AuthContext";
import { logClientError } from "../services/errorLogger";

export const goalFitnessInputsSchema = z.object({
  ftp: z.number().finite().positive(), weightKg: z.number().finite().positive(),
  thresholdPace: z.number().finite().positive(), css: z.number().finite().positive(),
  ftpSource: z.enum(["user", "pdc_estimate", "assumed"]),
  weightSource: z.enum(["user", "assumed"]),
  thresholdPaceSource: z.enum(["user", "assumed"]), cssSource: z.enum(["user", "assumed"]),
}).strict();
export type GoalFitnessInputs = z.infer<typeof goalFitnessInputsSchema>;
const experienceInputs: GoalFitnessInputs = { ftp: 200, weightKg: 70, thresholdPace: 275, css: 108,
  ftpSource: "assumed", weightSource: "assumed", thresholdPaceSource: "assumed", cssSource: "assumed" };

/** 3종목 미리보기가 서버 목표 생성과 동일한 출처·대체 체인을 사용한다. */
export function useGoalFitnessInputs() {
  const { user, profile } = useAuth();
  // 앱 임베드는 주입된 인스턴스를 쓴다 — 웹 싱글턴은 임베드에서 초기화되지 않는다.
  const { functions } = useFirebaseServices();
  const [result, setResult] = useState<{ uid: string; inputs: GoalFitnessInputs } | null>(null);
  useEffect(() => {
    let active = true;
    if (!user || user.isAnonymous) return;
    void httpsCallable<unknown, unknown>(functions, "getGoalFitnessInputs")({}).then(response => {
      const inputs = goalFitnessInputsSchema.parse(response.data);
      if (active) setResult({ uid: user.uid, inputs });
    }).catch(error => logClientError("useGoalFitnessInputs", error, {}));
    return () => { active = false; };
  }, [user?.uid, profile, functions]);
  return result && result.uid === user?.uid ? result.inputs : experienceInputs;
}

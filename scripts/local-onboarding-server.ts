import type { Plugin } from "vite";
import { randomUUID } from "node:crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FIRST_WORKOUT_PREVIEWS, startSport, validWorkoutDate, type FirstWorkout } from "../src/features/training/start/firstWorkout";

const PROJECT = "demo-orider-onboarding";
/** Only an explicitly isolated local demo can expose this review transport. */
export function localOnboardingServer(enabled: boolean): Plugin {
  return {
    name: "local-onboarding-review",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      if (process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19299"
        || process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:18280") throw new Error("Local onboarding requires isolated demo emulators");
      const app = getApps().find(item => item.name === PROJECT) ?? initializeApp({ projectId: PROJECT }, PROJECT);
      const store = getFirestore(app);
      server.middlewares.use("/runtime-config.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.end(JSON.stringify({ firebaseApiKey: "fake-local-key", firebaseProjectId: PROJECT,
          firebaseAuthDomain: `${PROJECT}.firebaseapp.com`, firebaseStorageBucket: `${PROJECT}.appspot.com`,
          firebaseAppId: "1:123:web:onboarding", firebaseFunctionsRegion: "us-central1", useEmulators: true,
          appEnvironment: "e2e", personalApiBase: "http://127.0.0.1:5180", aiApiBase: "http://127.0.0.1:5180" }));
      });
      server.middlewares.use("/__local/first-workout", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        const reply = (status: number, result: unknown) => { res.statusCode = status; res.end(JSON.stringify(result)); };
        try {
          const hostname = new URL(`http://${req.headers.host}`).hostname;
          if (!["127.0.0.1", "localhost"].includes(hostname)) { reply(403, { error: "local-only" }); return; }
          if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) { reply(403, { error: "origin" }); return; }
          if (!["GET", "POST"].includes(req.method ?? "")) { reply(405, { error: "method" }); return; }
          const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
          if (!token) { reply(401, { error: "unauthenticated" }); return; }
          let uid: string;
          try {
            const decoded = await getAuth(app).verifyIdToken(token);
            if (decoded.firebase.sign_in_provider === "anonymous") throw new Error("anonymous");
            uid = decoded.uid;
          } catch { reply(401, { error: "unauthenticated" }); return; }
          const sport = startSport(new URL(req.url ?? "/", "http://localhost").searchParams.get("sport"));
          if (!sport) { reply(400, { error: "sport" }); return; }
          const ref = store.doc(`users/${uid}/firstWorkouts/${sport}`);
          if (req.method === "GET") {
            const snapshot = await ref.get();
            const workout = snapshot.data();
            reply(200, { workout: workout?.status === "scheduled" ? workout : null }); return;
          }
          let raw = "";
          for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { reply(413, { error: "size" }); return; } }
          const input = JSON.parse(raw);
          if (!["reserve", "move", "cancel"].includes(input.action)
            || (input.action !== "cancel" && !validWorkoutDate(input.date))
            || (input.action === "reserve" && !/^[\w-]{16,80}$/.test(input.key ?? ""))) { reply(400, { error: "invalid" }); return; }
          const workout = await store.runTransaction(async tx => {
            const current = (await tx.get(ref)).data();
            const active = current?.status === "scheduled";
            if (input.action === "reserve") {
              if (active && current.key === input.key) return current;
              if (active) throw new Error("active-workout");
              const other = await tx.get(store.doc(`users/${uid}/firstWorkouts/${sport === "bike" ? "run" : "bike"}`));
              if (other.data()?.status === "scheduled") throw new Error("other-workout");
              const goals = await tx.get(store.collection("goals").where("userId", "==", uid).where("status", "==", "active").limit(1));
              // A local demo must never bypass existing goals or cross-sport decisions.
              if (!goals.empty) throw new Error("active-goal");
              const next: FirstWorkout & { key: string; createdAt: number; updatedAt: number } = {
                id: randomUUID(), sport, date: input.date, revision: 1, template: FIRST_WORKOUT_PREVIEWS[sport].template,
                status: "scheduled", key: input.key, createdAt: Date.now(), updatedAt: Date.now(),
              };
              tx.set(ref, next); return next;
            }
            if (!active || current.id !== input.id || current.revision !== input.revision) throw new Error("stale");
            const next = { ...current, revision: current.revision + 1, updatedAt: Date.now(),
              ...(input.action === "cancel" ? { status: "cancelled" } : { date: input.date }) };
            tx.set(ref, next); return input.action === "cancel" ? null : next;
          });
          reply(200, { workout });
        } catch (error) {
          const code = error instanceof Error ? error.message : "unknown";
          const conflict = ["active-workout", "other-workout", "active-goal", "stale"].includes(code);
          if (!conflict && !(error instanceof SyntaxError)) server.config.logger.error(`Local first workout failed: ${code}`);
          reply(conflict ? 409 : error instanceof SyntaxError ? 400 : 500, { error: conflict ? code : "request-failed" });
        }
      });
    },
  };
}

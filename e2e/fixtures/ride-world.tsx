import { logClientError } from "../../src/services/errorLogger";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, type User } from "firebase/auth";
import { useWorldEvent, worldLocation } from "../../src/features/ride-world/useWorldEvent";
import { resetRuntimeConfigForTests } from "../../src/services/runtimeConfig";

const projectId = "demo-orider-world";
resetRuntimeConfigForTests({ useEmulators: true, firebaseProjectId: projectId });
const auth = initializeAuth(initializeApp({ projectId, apiKey: "demo-key" }), { persistence: inMemoryPersistence });
connectAuthEmulator(auth, "http://127.0.0.1:19099", { disableWarnings: true });

function Fixture() {
  const [eventId, setEventId] = useState(new URLSearchParams(location.search).get("event") ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [far, setFar] = useState(false);
  const [bib, setBib] = useState("");
  const [meetingVersion, setMeetingVersion] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const preparation = new URLSearchParams(location.search).get("view") === "prep";
  const frame = useWorldEvent(eventId, user, null, { lat: far ? 37.9 : 37.55, lon: 126.99 }, preparation ? {
    changed: setMeetingVersion,
    phaseChanged: setPhase,
    disconnected: () => {},
  } : undefined, /^\d{1,6}$/.test(bib) ? Number(bib) : undefined,
    new URLSearchParams(location.search).get("view") === "guest");
  useEffect(() => {
    const fixtureWindow = window as Window & { __worldFixtureCredentials?: { email: string; password: string } };
    const credentials = fixtureWindow.__worldFixtureCredentials;
    delete fixtureWindow.__worldFixtureCredentials;
    if (credentials) void signInWithEmailAndPassword(auth, credentials.email, credentials.password)
      .then(({ user }) => setUser(user))
      .catch(error => { logClientError("rideWorldFixture.auth", error); });
  }, []);
  return <>
    <input aria-label="이벤트" value={eventId} onChange={(event) => setEventId(event.currentTarget.value)} />
    <input aria-label="공개 배번" value={bib} onChange={(event) => setBib(event.currentTarget.value)} />
    <button onClick={() => setFar(!far)}>구간 이동</button>
    <output data-testid="markers">{frame?.markers.map((marker) => {
      const location = worldLocation(marker);
      return <div key={marker.id}>{location.displayName} {location.status} {location.speed} km/h</div>;
    })}</output>
    <output data-testid="meeting-version">{meetingVersion}</output>
    <output data-testid="meeting-phase">{phase}</output>
    <output data-testid="roster">{JSON.stringify(frame?.roster ?? [])}</output>
  </>;
}

createRoot(document.getElementById("root")!).render(<Fixture />);

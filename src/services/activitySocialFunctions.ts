import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
// eslint-disable-next-line design-system/no-firebase-singleton-in-embed -- 일반 웹 callable 기본값. 임베드는 getActivitySocialFunctions(services.functions)를 사용한다.
import { functions } from "./firebase";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

const emulatorClients = new WeakSet<Functions>();
/** import 시점의 아직 초기화되지 않은 Firebase binding을 복사하지 않는다. */
export function getActivitySocialFunctions(source: Functions = functions): Functions {
  if (getRuntimeConfig().appEnvironment === "stage") return source;
  const client = getFunctions(source.app, "asia-northeast3");
  if (isEmulatorRuntime() && !emulatorClients.has(client)) {
    connectFunctionsEmulator(client, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
    emulatorClients.add(client);
  }
  return client;
}

import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { functions } from "./firebase";
import { getRuntimeConfig, isEmulatorRuntime } from "./runtimeConfig";

const emulatorClients = new WeakSet<Functions>();
/** import 시점의 아직 초기화되지 않은 Firebase binding을 복사하지 않는다. */
export function getActivitySocialFunctions(): Functions {
  if (getRuntimeConfig().appEnvironment === "stage") return functions;
  const client = getFunctions(functions.app, "asia-northeast3");
  if (isEmulatorRuntime() && !emulatorClients.has(client)) {
    connectFunctionsEmulator(client, "localhost", Number(import.meta.env.VITE_FUNCTIONS_EMULATOR_PORT || 5001));
    emulatorClients.add(client);
  }
  return client;
}

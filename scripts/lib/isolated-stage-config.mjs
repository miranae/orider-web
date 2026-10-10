/** Stage may use only its own Firebase identity and explicitly isolated services. */
export function checkIsolatedStageConfig(config) {
  if (config.appEnvironment !== "stage") throw new Error("isolated stage requires appEnvironment=stage");
  if (config.firebaseProjectId !== "orider-dev") throw new Error("isolated stage requires Firebase project orider-dev");
  if (config.firebaseAuthDomain !== "orider-dev.firebaseapp.com") throw new Error("isolated stage Auth domain mismatch");
  if (!/^orider-dev\.(?:firebasestorage\.app|appspot\.com)$/.test(config.firebaseStorageBucket ?? "")) throw new Error("isolated stage Storage bucket mismatch");
  if (config.firebaseAppId !== "1:818364001341:web:57f361a334532e0ee64e54" || String(config.firebaseMessagingSenderId) !== "818364001341") throw new Error("isolated stage Firebase app identity mismatch");
  if (config.firebaseFunctionsRegion !== "asia-northeast3") throw new Error("isolated stage Functions region mismatch");
  for (const key of ["aiApiBase", "personalApiBase", "segmentTilesBase", "heatmapBase", "stravaRedirectUri"]) {
    if (!config[key]) continue;
    const url = new URL(config[key]);
    const isolated = ["orider-dev.web.app", "orider-dev.firebaseapp.com", "asia-northeast3-orider-dev.cloudfunctions.net"].includes(url.hostname)
      || (url.hostname === "storage.googleapis.com" && /^\/orider-dev\.(?:firebasestorage\.app|appspot\.com)\//.test(url.pathname));
    if (url.protocol !== "https:" || !isolated || url.username || url.password) throw new Error(`isolated stage service origin mismatch: ${key}`);
  }
  if (config.useEmulators === true) throw new Error("deployed stage cannot use emulators");
}

/** Stage shares production Auth/data while callable compute stays on its own project. */
export function checkIsolatedStageConfig(config) {
  if (config.appEnvironment !== "stage") throw new Error("isolated stage requires appEnvironment=stage");
  if (config.firebaseProjectId !== "miranae-orider-g1") throw new Error("isolated stage requires shared Firebase data project miranae-orider-g1");
  if (config.firebaseAuthDomain !== "miranae-orider-g1.firebaseapp.com") throw new Error("isolated stage Auth domain mismatch");
  if (!/^miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)$/.test(config.firebaseStorageBucket ?? "")) throw new Error("isolated stage Storage bucket mismatch");
  if (config.firebaseAppId !== "1:289663940841:web:ba08cdae154286e6499878" || String(config.firebaseMessagingSenderId) !== "289663940841") throw new Error("isolated stage Firebase app identity mismatch");
  if (config.firebaseFunctionsRegion !== "asia-northeast3") throw new Error("isolated stage Functions region mismatch");
  if (config.firebaseFunctionsBase !== "https://asia-northeast3-orider-dev.cloudfunctions.net") throw new Error("stage callable endpoint mismatch");
  for (const key of ["aiApiBase", "personalApiBase", "segmentTilesBase", "heatmapBase", "stravaRedirectUri"]) {
    if (!config[key]) continue;
    const url = new URL(config[key]);
    const isolated = ["orider-dev.web.app", "orider-dev.firebaseapp.com", "asia-northeast3-orider-dev.cloudfunctions.net"].includes(url.hostname)
      || (["segmentTilesBase", "heatmapBase"].includes(key) && url.hostname === "storage.googleapis.com" && /^\/miranae-orider-g1\.(?:firebasestorage\.app|appspot\.com)\//.test(url.pathname));
    if (url.protocol !== "https:" || !isolated || url.username || url.password) throw new Error(`isolated stage service origin mismatch: ${key}`);
  }
  if (config.useEmulators === true) throw new Error("deployed stage cannot use emulators");
}

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";

export function stageArtifactManifest(directory) {
  const files = [];
  function visit(path, relativePath) {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("stage parity prepared artifact contains a symlink");
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
    } else if (stat.isFile()) {
      files.push([relativePath, createHash("sha256").update(readFileSync(path)).digest("hex")]);
    } else throw new Error("stage parity prepared artifact contains an unsupported file");
  }
  visit(directory, "");
  return files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}

// 원격 확인을 기다리는 동안 산출물이 바뀌어도 배포를 중단한다.
export async function verifyStageArtifacts(directory, expected, verifyRemote) {
  const verify = () => {
    if (!Array.isArray(expected) || !isDeepStrictEqual(stageArtifactManifest(directory), expected)) {
      throw new Error("stage parity prepared artifact differs from the build receipt");
    }
  };
  verify();
  const result = await verifyRemote();
  verify();
  return result;
}

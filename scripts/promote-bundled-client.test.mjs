import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { prepareClientPromotion, verifyPromotionFiles, validateCandidateRun } from "./promote-bundled-client.mjs";
import { stageArtifactManifest } from "./lib/stage-artifact-manifest.mjs";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const source = { appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com", firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3", firebaseApiKey: "public", appCheckRecaptchaSiteKey: "public", stravaClientId: "public", mapboxToken: "public", stravaRedirectUri: "https://orider-strava.web.app/strava/callback", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app", publicClubApiUrl: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs", activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: false };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "client-promotion-")), archive = join(root, "archive"), workspace = join(root, "workspace"), directory = join(root, "prepared"), dist = join(archive, "nested", "dist");
  mkdirSync(join(dist, "assets"), {recursive:true}); mkdirSync(join(dist, ".well-known")); mkdirSync(workspace);
  const write = (path,value) => writeFileSync(path,JSON.stringify(value));
  writeFileSync(join(dist,"index.html"),'<script type="module" src="/assets/index-abc.js"></script>');
  writeFileSync(join(dist,"assets/index-abc.js"),"export const unchanged = true;");
  writeFileSync(join(dist,".well-known/assetlinks.json"),"[]");
  const runtime = bundledFunctionsConfig(source,"development"); write(join(dist,"runtime-config.json"),runtime);
  const configPath = join(archive,"nested/firebase.bundled-stage.json"), config = bundledHostingConfig(JSON.parse(readFileSync(new URL("../firebase.json",import.meta.url))),"development");
  delete config.hosting.target; config.hosting.site="orider-dev"; config.hosting.public="dist"; write(configPath,config);
  const manifest = stageArtifactManifest(dist), receipt = {schemaVersion:1,mode:"bundled-development-client",complete:true,frontendSourceSha:"a".repeat(40),backendSourceSha:"b".repeat(40),backendTopologyHash:"c".repeat(64),artifactManifest:manifest,artifactHash:hash(JSON.stringify(manifest)),runtimeHash:hash(readFileSync(join(dist,"runtime-config.json"))),hostingHash:hash(readFileSync(configPath))};
  write(join(archive,"build.json"),receipt);
  const run = {id:123,run_attempt:1,repository:{full_name:"miranae/orider-web"},path:".github/workflows/deploy-stage.yml",event:"workflow_dispatch",status:"completed",conclusion:"success"};
  const artifact = {id:456,name:`stage-client-${receipt.frontendSourceSha}`,expired:false};
  return {root,archive,workspace,directory,dist,run,artifact,attempt:1,receipt,write,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test("promotion preserves all compiled/static bytes, hidden files and flags while replacing only runtime",()=>{
  const f=fixture();try{
    const r=prepareClientPromotion(f);assert.equal(r.rebuilt,false);assert.equal(r.runtime.activitySubscriptionsBackendReady,false);
    assert.equal(r.runtime.deploymentProfile,"bundled-production");assert.ok(!JSON.stringify(r.runtime).includes("dev-bundle"));
    const before=f.receipt.artifactManifest.filter(([path])=>path!=="runtime-config.json"),after=stageArtifactManifest(join(f.workspace,"dist")).filter(([path])=>path!=="runtime-config.json");assert.deepEqual(after,before);
    const hosting=JSON.parse(readFileSync(join(f.workspace,"firebase.bundled-production.json"))).hosting;
    assert.equal(hosting.site,"miranae-orider-g1");assert.ok(!hosting.predeploy.includes("build"));assert.ok(hosting.rewrites.filter(r=>r.run).every(r=>r.run.serviceId==="orider-bundle-default-api"));
    verifyPromotionFiles(f);
    writeFileSync(join(f.workspace,"dist/assets/index-abc.js"),"changed");assert.throws(()=>verifyPromotionFiles(f),/changed/);
  }finally{f.cleanup();}
});
test("missing hidden files, changed payload, added stale files, wrong source/runtime all reject before preparation",()=>{
  for(const change of [f=>rmSync(join(f.dist,".well-known"),{recursive:true}),f=>writeFileSync(join(f.dist,"assets/index-abc.js"),"changed"),f=>writeFileSync(join(f.dist,"stale.js"),"stale"),f=>{f.artifact.name=`stage-client-${"e".repeat(40)}`;},f=>f.write(join(f.dist,"runtime-config.json"),source)]){
    const f=fixture();try{change(f);assert.throws(()=>prepareClientPromotion(f),/mismatch/);}finally{f.cleanup();}
  }
});
test("failed runs, wrong attempts/workflows/repos and expired artifacts cannot promote",()=>{
  const f=fixture();try{
    for(const patch of [{conclusion:"failure"},{run_attempt:2},{path:".github/workflows/ci.yml"},{repository:{full_name:"other/repo"}},{event:"pull_request"}])assert.throws(()=>validateCandidateRun({...f.run,...patch},f.artifact,1),/selected/);
    assert.throws(()=>validateCandidateRun(f.run,{...f.artifact,expired:true},1),/unexpired/);
  }finally{f.cleanup();}
});
test("workflow rehearsal has no production environment and promotion has no build",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/promote-hosting.yml",import.meta.url),"utf8");
  assert.ok(!workflow.includes("npm run build"));assert.ok(!workflow.split("  promote:")[0].includes("environment: production"));assert.match(workflow,/if: inputs.phase == 'promote'/);assert.match(workflow,/environment: production/);
  const stage=readFileSync(new URL("../.github/workflows/deploy-stage.yml",import.meta.url),"utf8");assert.match(stage,/name: stage-client-[\s\S]*?include-hidden-files: true/);
});

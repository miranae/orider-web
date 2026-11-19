import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prepareClientPromotion, verifyPromotionFiles, validateCandidateRun, assertReviewedSource } from "./promote-bundled-client.mjs";
import { archiveHostingCandidate, restoreHostingCandidate, HOSTING_CANDIDATE_BUCKET } from "./hosting-candidate-archive.mjs";
import { stageArtifactManifest } from "./lib/stage-artifact-manifest.mjs";
import { bundledFunctionsConfig, bundledHostingConfig } from "./lib/bundled-functions-config.mjs";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const source = { appEnvironment: "production", firebaseProjectId: "miranae-orider-g1", firebaseAuthDomain: "miranae-orider-g1.firebaseapp.com", firebaseStorageBucket: "miranae-orider-g1.firebasestorage.app", firebaseAppId: "1:289663940841:web:ba08cdae154286e6499878", firebaseMessagingSenderId: "289663940841", firebaseFunctionsRegion: "asia-northeast3", firebaseApiKey: "public", appCheckRecaptchaSiteKey: "public", stravaClientId: "public", mapboxToken: "public", stravaRedirectUri: "https://orider-strava.web.app/strava/callback", aiApiBase: "https://orider-ai-api-h5zqzw3n4a-du.a.run.app", publicClubApiUrl: "https://asia-northeast3-miranae-orider-g1.cloudfunctions.net/publicClubs", activitySubscriptionsEnabled: true, activitySubscriptionsBackendReady: false };
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "client-promotion-")), archive = join(root, "archive"), workspace = join(root, "workspace"), directory = join(root, "prepared"), dist = join(archive, "nested", "dist");
  mkdirSync(join(dist, "assets"), {recursive:true}); mkdirSync(join(dist, ".well-known")); mkdirSync(workspace);
  const git = (...args) => execFileSync("git",args,{cwd:workspace,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
  git("init","-b","main");git("config","user.name","Fixture");git("config","user.email","fixture@example.test");writeFileSync(join(workspace,"README.md"),"reviewed\n");git("add",".");git("commit","-m","reviewed");
  const frontendSourceSha=git("rev-parse","HEAD");git("update-ref","refs/remotes/origin/main",frontendSourceSha);
  const write = (path,value) => writeFileSync(path,JSON.stringify(value));
  writeFileSync(join(dist,"index.html"),'<script type="module" src="/assets/index-abc.js"></script>');
  writeFileSync(join(dist,"assets/index-abc.js"),"export const unchanged = true;");
  writeFileSync(join(dist,".well-known/assetlinks.json"),"[]");
  const runtime = bundledFunctionsConfig(source,"development"); write(join(dist,"runtime-config.json"),runtime);
  const configPath = join(archive,"nested/firebase.bundled-stage.json"), config = bundledHostingConfig(JSON.parse(readFileSync(new URL("../firebase.json",import.meta.url))),"development");
  delete config.hosting.target; config.hosting.site="orider-dev"; config.hosting.public="dist"; write(configPath,config);
  const manifest = stageArtifactManifest(dist), receipt = {schemaVersion:1,mode:"bundled-development-client",complete:true,frontendSourceSha,backendSourceSha:"b".repeat(40),backendTopologyHash:"c".repeat(64),artifactManifest:manifest,artifactHash:hash(JSON.stringify(manifest)),runtimeHash:hash(readFileSync(join(dist,"runtime-config.json"))),hostingHash:hash(readFileSync(configPath))};
  write(join(archive,"build.json"),receipt);
  const run = {id:123,run_attempt:1,head_sha:"d".repeat(40),repository:{full_name:"miranae/orider-web"},path:".github/workflows/deploy-stage.yml",event:"workflow_dispatch",status:"completed",conclusion:"success"};
  const artifact = {kind:"gcs",bucket:HOSTING_CANDIDATE_BUCKET,object:"deploy-candidates/hosting/123/1/candidate.tgz",generation:"456",sha256:"f".repeat(64),frontendSourceSha,workflowSourceSha:run.head_sha,artifactHash:receipt.artifactHash};
  return {root,archive,workspace,directory,dist,run,artifact,attempt:1,receipt,write,git,cleanup:()=>rmSync(root,{recursive:true,force:true})};
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
  for(const change of [f=>rmSync(join(f.dist,".well-known"),{recursive:true}),f=>writeFileSync(join(f.dist,"assets/index-abc.js"),"changed"),f=>writeFileSync(join(f.dist,"stale.js"),"stale"),f=>{f.artifact.frontendSourceSha="e".repeat(40);},f=>f.write(join(f.dist,"runtime-config.json"),source)]){
    const f=fixture();try{change(f);assert.throws(()=>prepareClientPromotion(f));}finally{f.cleanup();}
  }
});
test("failed runs, wrong attempts/workflows/repos and unpinned archives cannot promote",()=>{
  const f=fixture();try{
    for(const patch of [{conclusion:"failure"},{run_attempt:2},{path:".github/workflows/ci.yml"},{repository:{full_name:"other/repo"}},{event:"pull_request"}])assert.throws(()=>validateCandidateRun({...f.run,...patch},f.artifact,1),/selected/);
    assert.throws(()=>validateCandidateRun(f.run,{...f.artifact,generation:""},1),/pinned/);
  }finally{f.cleanup();}
});
test("workflow rehearsal has no production environment and promotion has no build",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/promote-hosting.yml",import.meta.url),"utf8");
  assert.ok(!workflow.includes("npm run build"));assert.ok(!workflow.split("  promote:")[0].includes("environment: production"));assert.match(workflow,/if: inputs.phase == 'promote'/);assert.match(workflow,/environment: production/);
  const stage=readFileSync(new URL("../.github/workflows/deploy-stage.yml",import.meta.url),"utf8");assert.match(stage,/name: stage-client-[\s\S]*?include-hidden-files: true/);
});

function fakeStorage({ loseCreateResponse = false, corruptDownload = false } = {}) {
  let stored, bytes; const requests=[];
  const fetcher=async(url,options={})=>{
    requests.push({url,method:options.method||"GET"});
    if(options.method==="POST"){
      assert.match(url,/ifGenerationMatch=0/u);
      const body=options.body, separator=Buffer.from("\r\n\r\n"), first=body.indexOf(separator)+separator.length;
      const metadataEnd=body.indexOf(Buffer.from("\r\n--"),first), metadata=JSON.parse(body.subarray(first,metadataEnd).toString());
      const gzipHeader=Buffer.from("Content-Type: application/gzip\r\n\r\n"), start=body.indexOf(gzipHeader,metadataEnd)+gzipHeader.length;
      bytes=body.subarray(start,body.lastIndexOf(Buffer.from("\r\n--")));
      stored={bucket:HOSTING_CANDIDATE_BUCKET,name:metadata.name,generation:"987654321",size:String(bytes.length),metadata:metadata.metadata};
      if(loseCreateResponse)throw Error("response lost after create");
      return Response.json(stored);
    }
    if(url.includes("alt=media")){assert.match(url,/generation=987654321/u);return new Response(corruptDownload?Buffer.from("corrupt"):bytes);}
    return Response.json(stored);
  };
  return {fetcher,requests};
}
test("durable archive restores exact hidden/static files after GitHub run metadata expires",async()=>{
  const f=fixture(),storage=fakeStorage();try{
    const saved=await archiveHostingCandidate({workspace:join(f.archive,"nested"),buildReceipt:join(f.archive,"build.json"),directory:join(f.root,"stored"),runId:123,attempt:1,workflowSourceSha:f.run.head_sha,token:"fixture",fetcher:storage.fetcher});
    const restored=await restoreHostingCandidate({runId:123,attempt:1,directory:join(f.root,"restored"),token:"fixture",fetcher:storage.fetcher});
    assert.equal(restored.validation,"archived-stage-acceptance");assert.equal(restored.generation,saved.generation);
    const archivedRun=JSON.parse(readFileSync(join(f.root,"restored/run.json")));
    assert.equal(archivedRun.stageAcceptanceComplete,true);assert.equal(archivedRun.conclusion,undefined);
    const receipt=prepareClientPromotion({...f,archive:restored.payload,artifact:restored,run:archivedRun});
    assert.equal(receipt.candidateRunValidation,"archived-stage-acceptance");assert.equal(receipt.candidateArchive.generation,"987654321");
    assert.deepEqual(stageArtifactManifest(join(restored.payload,"dist")),f.receipt.artifactManifest);
  }finally{f.cleanup();}
});
test("create response loss is reconciled by immutable checksum readback; corrupt downloads reject",async()=>{
  for(const corruptDownload of [false,true]){
    const f=fixture(),storage=fakeStorage({loseCreateResponse:true,corruptDownload});try{
      await archiveHostingCandidate({workspace:join(f.archive,"nested"),buildReceipt:join(f.archive,"build.json"),directory:join(f.root,"stored"),runId:123,attempt:1,workflowSourceSha:f.run.head_sha,token:"fixture",fetcher:storage.fetcher});
      const restore=()=>restoreHostingCandidate({run:f.run,runId:123,attempt:1,directory:join(f.root,"restored"),token:"fixture",fetcher:storage.fetcher});
      if(corruptDownload)await assert.rejects(restore(),/checksum/);else assert.equal((await restore()).generation,"987654321");
      assert.deepEqual(storage.requests.slice(0,2).map(r=>r.method),["POST","GET"]);
    }finally{f.cleanup();}
  }
});
test("squash-promoted identical Git tree is reviewed without requiring candidate ancestry",()=>{
  const f=fixture();try{
    f.git("checkout","-b","dev");writeFileSync(join(f.workspace,"feature.txt"),"new feature\n");f.git("add",".");f.git("commit","-m","dev candidate");const candidate=f.git("rev-parse","HEAD");
    f.git("checkout","main");f.git("merge","--squash","dev");f.git("commit","-m","reviewed squash");const reviewed=f.git("rev-parse","HEAD");f.git("update-ref","refs/remotes/origin/main",reviewed);
    assert.equal(assertReviewedSource(f.workspace,candidate),reviewed);
    f.git("checkout","dev");writeFileSync(join(f.workspace,"feature.txt"),"not reviewed\n");f.git("add",".");f.git("commit","-m","unreviewed");assert.throws(()=>assertReviewedSource(f.workspace,f.git("rev-parse","HEAD")),/not reviewed/);
  }finally{f.cleanup();}
});

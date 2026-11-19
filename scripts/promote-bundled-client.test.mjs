import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { prepareClientPromotion, verifyClientPromotion, verifyPublishedPromotion, validateCandidateRun, assertReviewedSource } from "./promote-bundled-client.mjs";
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
  const run = {id:123,run_attempt:1,head_sha:frontendSourceSha,head_branch:"main",repository:{full_name:"miranae/orider-web"},path:".github/workflows/deploy-stage.yml",event:"workflow_dispatch",status:"completed",conclusion:"success"};
  const artifact = {kind:"gcs",bucket:HOSTING_CANDIDATE_BUCKET,object:"deploy-candidates/hosting/123/1/candidate.tgz",generation:"456",sha256:"f".repeat(64),frontendSourceSha,workflowSourceSha:run.head_sha,artifactHash:receipt.artifactHash};
  return {root,archive,workspace,directory,dist,run,artifact,attempt:1,receipt,write,git,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
test("promotion preserves all compiled/static bytes, hidden files and flags while replacing only runtime",()=>{
  const f=fixture();try{
    const r=prepareClientPromotion(f);assert.equal(r.rebuilt,false);assert.equal(r.runtime.activitySubscriptionsBackendReady,false);
    assert.equal(r.runtime.deploymentProfile,"bundled-production");assert.ok(!JSON.stringify(r.runtime).includes("dev-bundle"));
    const before=f.receipt.artifactManifest.filter(([path])=>path!=="runtime-config.json"),after=stageArtifactManifest(join(f.workspace,"dist")).filter(([path])=>path!=="runtime-config.json");assert.deepEqual(after,before);
    const hosting=JSON.parse(readFileSync(join(f.workspace,"firebase.bundled-production.json"))).hosting;
    assert.equal(hosting.site,"miranae-orider-g1");assert.equal(hosting.predeploy,undefined);assert.ok(hosting.rewrites.filter(r=>r.run).every(r=>r.run.serviceId==="orider-bundle-default-api"));
  }finally{f.cleanup();}
});
test("missing hidden files, changed payload, added stale files, wrong source/runtime all reject before preparation",()=>{
  for(const change of [f=>rmSync(join(f.dist,".well-known"),{recursive:true}),f=>writeFileSync(join(f.dist,"assets/index-abc.js"),"changed"),f=>writeFileSync(join(f.dist,"stale.js"),"stale"),f=>{f.artifact.frontendSourceSha="e".repeat(40);},f=>f.write(join(f.dist,"runtime-config.json"),source)]){
    const f=fixture();try{change(f);assert.throws(()=>prepareClientPromotion(f));}finally{f.cleanup();}
  }
});
test("a valid development artifact cannot change the origin of production assets",()=>{
  const f=fixture();try{
    const index=join(f.dist,"index.html");
    writeFileSync(index,'<base href="https://orider-dev.web.app/">' + readFileSync(index,"utf8"));
    f.receipt.artifactManifest=stageArtifactManifest(f.dist);
    f.receipt.artifactHash=f.artifact.artifactHash=hash(JSON.stringify(f.receipt.artifactManifest));
    f.write(join(f.archive,"build.json"),f.receipt);
    assert.throws(()=>prepareClientPromotion(f),/must not set a base URL/);
  }finally{f.cleanup();}
});
test("failed runs, wrong attempts/workflows/repos and unpinned archives cannot promote",()=>{
  const f=fixture();try{
    for(const patch of [{conclusion:"failure"},{run_attempt:2},{path:".github/workflows/ci.yml"},{repository:{full_name:"other/repo"}},{event:"pull_request"}])assert.throws(()=>validateCandidateRun({...f.run,...patch},f.artifact,1),/selected/);
    assert.throws(()=>validateCandidateRun(f.run,{...f.artifact,generation:""},1),/pinned/);
  }finally{f.cleanup();}
});
test("promotion is one production job without application install, rebuild, rehearsal or artifact transfer",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/promote-hosting.yml",import.meta.url),"utf8");
  for(const removed of ["npm ci","npm run build","actions/download-artifact","verify-bundled-hosting","inputs.phase","environment: stage"])assert.ok(!workflow.includes(removed),removed);
  assert.deepEqual([...workflow.matchAll(/^  ([A-Za-z_-]+):$/gm)].map(match=>match[1]).filter(name=>["prepare","promote"].includes(name)),["promote"]);
  assert.match(workflow,/--phase snapshot[\s\S]*?--phase rollback/);
  assert.match(workflow,/Retain recovery receipt[^\n]+\n[^\n]+failure\(\)[^\n]+\n\s+continue-on-error: true\n\s+uses: actions\/upload-artifact@v4/);
  assert.match(workflow,/attestations: read/);
  assert.match(workflow,/environment: production/);assert.match(workflow,/GCP_WORKLOAD_IDENTITY_PROVIDER/);assert.match(workflow,/if: always\(\)/);assert.match(workflow,/--jq \.created_at/);
  const stage=readFileSync(new URL("../.github/workflows/deploy-stage.yml",import.meta.url),"utf8");assert.match(stage,/name: stage-client-[\s\S]*?include-hidden-files: true/);
});

test("checks gateway readiness and the login route without binding the backend commit",async()=>{
  const f=fixture();try{
    prepareClientPromotion(f);
    const headers = {
      "access-control-allow-origin":"https://orider.co.kr",
      "access-control-allow-methods":"POST",
      "access-control-allow-headers":"authorization,content-type,x-firebase-appcheck",
    };
    const calls = [];
    const fetcher = async (url, init = {}) => {
      const path = new URL(url).pathname;
      calls.push([path, init.method ?? "GET"]);
      if (path === "/readyz") return Response.json({status:"ok",sourceSha:"e".repeat(40),topologyHash:"f".repeat(64)});
      if (init.method === "OPTIONS") return new Response(null, {status:204,headers});
      return Response.json({error:{status:"INVALID_ARGUMENT"}}, {status:400,headers});
    };
    await verifyClientPromotion(f,fetcher);
    assert.deepEqual(calls,[["/readyz","GET"],["/socialAuthStart","OPTIONS"],["/socialAuthStart","POST"]]);
    await assert.rejects(verifyClientPromotion(f,async(url,init)=>url.endsWith("/readyz") ? new Response("not ready",{status:503}) : fetcher(url,init)),/unavailable/);
    await assert.rejects(verifyClientPromotion(f,async(url,init)=>url.endsWith("/readyz") ? new Response("<html>error</html>") : fetcher(url,init)),/response body is invalid.*\/readyz/);
    await assert.rejects(verifyClientPromotion(f,async(url,init)=>init.method === "OPTIONS" ? new Response(null,{status:404}) : fetcher(url,init)),/socialAuthStart browser preflight rejected/);
  }finally{f.cleanup();}
});

test("one public release check validates the HTML, entry, runtime and sitemap rewrite",async()=>{
  const f=fixture();try{
    prepareClientPromotion(f);const urls=[];
    const fetcher=async url=>{
      urls.push(url.pathname);
      if (url.pathname === "/sitemap.xml") return new Response("<urlset/>", {headers:{"content-type":"application/xml"}});
      const file = join(f.workspace, "dist", url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      return new Response(readFileSync(file), {headers:{"content-type":url.pathname.endsWith(".js") ? "application/javascript" : "text/plain"}});
    };
    await verifyPublishedPromotion(f,fetcher);assert.deepEqual(urls.sort(),["/","/assets/index-abc.js","/runtime-config.json","/sitemap.xml"]);
    await assert.rejects(verifyPublishedPromotion(f,async url=>url.pathname.endsWith(".js") ? new Response("<html>fallback</html>", {headers:{"content-type":"text/html"}}) : fetcher(url)),/did not return JavaScript/);
    await assert.rejects(verifyPublishedPromotion(f,async url=>url.pathname === "/sitemap.xml" ? new Response("not found", {status:404}) : fetcher(url)),/sitemap.xml.*HTTP404/);
    await assert.rejects(verifyPublishedPromotion(f,async url=>url.pathname === "/runtime-config.json" ? new Response("stale") : fetcher(url)),/differs/);
  }finally{f.cleanup();}
});

function fakeStorage({ loseCreateResponse = false, corruptDownload = false } = {}) {
  let stored, bytes; const requests=[];
  const fetcher=async(url,options={})=>{
    requests.push({url,method:options.method||"GET"});
    if(options.method==="POST"){
      assert.match(url,/ifGenerationMatch=0/u);
      assert.ok(options.headers["Content-Type"].split("boundary=")[1].length <= 70);
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
    const options = {runId:123,attempt:1,token:"fixture",fetcher:storage.fetcher};
    await assert.rejects(restoreHostingCandidate({...options,directory:join(f.root,"untrusted"),verifyAttestation:()=>{
      throw new Error("untrusted archive");
    }}), /untrusted archive/);
    const restored=await restoreHostingCandidate({...options,directory:join(f.root,"restored"),verifyAttestation:(file,record)=>{
      assert.equal(hash(readFileSync(file)), record.sha256);
      assert.equal(record.frontendSourceSha, f.run.head_sha);
    }});
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
      const restore=()=>restoreHostingCandidate({run:f.run,runId:123,attempt:1,directory:join(f.root,"restored"),token:"fixture",fetcher:storage.fetcher,verifyAttestation:()=>{}});
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

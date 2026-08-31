import { afterEach, expect, test } from "bun:test";
import { SAMPLE_STRATEGY, type DecisionFields } from "@strategy-court/schemas";
import { ENGINE_VERSION } from "@strategy-court/domain";
import { createTestHarness } from "./test-database";
import type { ApiApp } from "../src/app";
import { FixtureMarketProvider, contentHash } from "../src/providers/market";
import { sampleSettings, sampleStrategy, type PreparedSample } from "../src/services/samples";

const harness=createTestHarness();
afterEach(()=>harness.cleanup());
async function request(app:ApiApp,method:string,path:string,input?:unknown,actor="user") {
  const response=await app.fetch(new Request(`http://api.test${path}`,{method,headers:{"content-type":"application/json","x-actor":actor},body:input===undefined ? undefined : JSON.stringify(input)}));
  return {status:response.status,body:await response.json() as any};
}
const testCourt=async()=>({reproducibilityId:"test-only",summaryLabel:"Fragile",result:{summaryLabel:"Fragile",metrics:{numberOfTrades:1},
  verdicts:[{id:"costs",status:"Fail"}],failures:[{id:"cost-period"}],trades:[{symbol:"SPY",entryDate:"2024-01-02",exitDate:"2024-01-03"}]}});
const fields:DecisionFields={outcome:"rejected",rationale:"The cost stress fails.",evidenceRefs:[{kind:"verdict",id:"costs"}],uncertainties:"Only one completed trade.",revisitCriteria:"A separately reserved period with enough trades."};
async function completed(app:ApiApp) {
  const created=await request(app,"POST","/api/cases",{...sampleSettings,dateFrom:"2024-01-01",dateTo:"2024-12-31"});
  const caseId=created.body.case.id;
  const draft=await request(app,"POST",`/api/cases/${caseId}/strategy-drafts`,{definition:{...SAMPLE_STRATEGY,universe:sampleSettings.symbols},interpretation:"Test rules"});
  const versionId=draft.body.version.id;
  await request(app,"POST",`/api/cases/${caseId}/strategy-versions/${versionId}/confirm`,{});
  const started=await request(app,"POST",`/api/cases/${caseId}/court-runs`,{strategyVersionId:versionId,dataSnapshotPolicy:"frozen"});
  await app.queue.idle();
  return {caseId,versionId,runId:started.body.run.id};
}

test("agent proposals remain private; user confirmation is immutable, cited and run-bound",async()=>{
  const app=await harness.app({courtExecutor:testCourt});
  const scope=await completed(app);
  const path=`/api/cases/${scope.caseId}`;
  const input={...scope,requestId:"decision-request-1",fields};
  const proposed=await request(app,"POST",`${path}/decision-drafts`,input,"agent");
  expect(proposed.status).toBe(201);
  const id=proposed.body.decision.id;
  expect((await request(app,"POST",`${path}/decision-drafts`,input,"agent")).body.decision.id).toBe(id);
  expect((await request(app,"GET",`/api/reports/${scope.runId}`)).body.report.decisions).toEqual([]);
  const confirmation={fields,expectedPredecessorId:null};
  expect((await request(app,"POST",`${path}/decisions/${id}/confirm`,confirmation,"agent")).status).toBe(403);
  expect((await request(app,"POST",`${path}/decisions/${id}/confirm`,confirmation)).status).toBe(200);
  expect((await request(app,"POST",`${path}/decisions/${id}/confirm`,confirmation)).status).toBe(200);
  expect((await request(app,"POST",`${path}/decisions/${id}/confirm`,{...confirmation,fields:{...fields,rationale:"Changed"}})).status).toBe(409);
  const report=await request(app,"GET",`/api/reports/${scope.runId}`);
  expect(report.body.report.decisions[0]).toMatchObject({state:"confirmed",outcome:"rejected",evidenceRefs:fields.evidenceRefs});
  const invalid=await request(app,"POST",`${path}/decision-drafts`,{...input,requestId:"decision-request-2",fields:{...fields,evidenceRefs:[{kind:"trade",id:"trade-99"}]}});
  expect(invalid.status).toBe(422);
  const replay=await request(app,"POST",`${path}/decision-drafts`,{...input,requestId:"decision-request-3",fields:{...fields,outcome:"ready_for_replay"}});
  expect(replay.status).toBe(409);
  const second=await request(app,"POST",`${path}/decision-drafts`,{...input,requestId:"decision-request-4",fields:{...fields,outcome:"needs_more_evidence"}});
  const secondId=second.body.decision.id;
  expect((await request(app,"POST",`${path}/decisions/${secondId}/confirm`,{fields:second.body.decision,expectedPredecessorId:null})).status).toBe(422);
  expect((await request(app,"POST",`${path}/decisions/${secondId}/confirm`,{fields:{...fields,outcome:"needs_more_evidence"},expectedPredecessorId:null})).status).toBe(409);
  expect((await request(app,"POST",`${path}/decisions/${secondId}/confirm`,{fields:{...fields,outcome:"needs_more_evidence"},expectedPredecessorId:id})).status).toBe(200);
  const other=await completed(app);
  expect((await request(app,"GET",`/api/reports/${other.runId}`)).body.report.decisions).toEqual([]);
  const crossing=await request(app,"POST",`/api/cases/${other.caseId}/decision-drafts`,input);
  expect(crossing.status).toBe(409);
});

test("case creation retries are owner-scoped and atomic",async()=>{
  const app=await harness.app();
  const input={...sampleSettings,requestId:"case-request-123"};
  const [first,second]=await Promise.all([request(app,"POST","/api/cases",input,"agent"),request(app,"POST","/api/cases",input,"agent")]);
  expect(first.status).toBe(201);expect(second.status).toBe(201);
  expect(first.body.case.id).toBe(second.body.case.id);
  expect((await request(app,"POST","/api/cases",{...input,name:"Different"})).status).toBe(409);
  const loaded=await request(app,"GET",`/api/cases/${first.body.case.id}`);
  expect(loaded.body.case.audit.filter((event:any)=>event.action==="case.created")).toHaveLength(1);
  expect(loaded.body.case.audit[0].actor).toBe("agent");
});

test("shared reports expose confirmed decisions only and other owners cannot read or confirm drafts", async () => {
  const database = await harness.createDatabase();
  const owner = await harness.app({ courtExecutor: testCourt }, database);
  const scope = await completed(owner);
  const path = `/api/cases/${scope.caseId}`;
  const draft = await request(owner, "POST", `${path}/decision-drafts`, { ...scope, requestId: "private-proposal-1", fields }, "agent");
  const id = draft.body.decision.id;
  const stranger = await harness.app({ resolveSession: async () => ({ user: { id: "different-user", name: "Other", email: "other@example.test" } }) }, database);
  expect((await request(stranger, "GET", path)).status).toBe(404);
  expect((await request(stranger, "GET", `${path}/decisions`)).status).toBe(404);
  expect((await request(stranger, "POST", `${path}/decisions/${id}/confirm`, { fields, expectedPredecessorId: null })).status).toBe(404);
  const share = await request(owner, "POST", `/api/reports/${scope.runId}/share`);
  const publicPath = `/api/shared/reports/${share.body.share.token}`;
  const anonymous = await harness.app({ resolveSession: async () => null }, database);
  expect((await request(anonymous, "GET", publicPath)).body.report.decisions).toEqual([]);
  await request(owner, "POST", `${path}/decisions/${id}/confirm`, { fields, expectedPredecessorId: null });
  await request(owner, "POST", `${path}/decision-drafts`, { ...scope, requestId: "private-proposal-2", fields: { ...fields, rationale: "Private draft marker" } });
  const report = (await request(anonymous, "GET", publicPath)).body.report;
  expect(report.decisions).toHaveLength(1);
  expect(report.decisions[0]).toMatchObject({ outcome: "rejected", rationale: fields.rationale, source: "agent" });
  for (const privateValue of [id, scope.caseId, scope.versionId, scope.runId, "test-user", "Private draft marker"]) {
    expect(JSON.stringify(report)).not.toContain(privateValue);
  }
});

test("cache matching rejects synthetic data and mismatched feeds",async()=>{
  const app=await harness.app();
  const snapshot=await app.store.saveSnapshot(await new FixtureMarketProvider().getSnapshot({symbols:["SPY"],dateFrom:"2024-01-01",dateTo:"2024-12-31"}));
  expect(await app.store.findSnapshot(["SPY"],"2024-01-01","2024-12-31",{provider:"alpaca",feed:"sip",adjustment:"all"})).toBeNull();
  expect((await app.store.findSnapshot(["SPY"],"2024-01-01","2024-12-31",snapshot))?.id).toBe(snapshot.id);
  expect(await app.store.findSnapshot(["SPY"],"2024-01-01","2024-12-31",{...snapshot,feed:"iex"})).toBeNull();
});

test("prepared sample uses a pinned snapshot without provider access and rejects tampering",async()=>{
  let calls=0;
  const app=await harness.app({courtExecutor:async()=>{
    const output=await testCourt();
    return {...output,summaryLabel:"Surviving",result:{...output.result,summaryLabel:"Surviving"}};
  },marketProvider:{getSnapshot:async()=>{calls++;throw new Error("Provider offline");}}});
  // Adapter test only: these generated bars are never installed as a real deployment sample.
  const synthetic=await new FixtureMarketProvider().getSnapshot({symbols:sampleSettings.symbols,dateFrom:sampleSettings.dateFrom,dateTo:sampleSettings.dateTo});
  const requestMetadata={...synthetic.request,testOnly:true,feed:"sip"};
  const snapshot=await app.store.saveSnapshot({...synthetic,provider:"alpaca",feed:"sip",request:requestMetadata,hash:contentHash({request:requestMetadata,bars:synthetic.bars})});
  const manifest:PreparedSample={id:"test-sample",settings:sampleSettings,definition:sampleStrategy,engineVersion:ENGINE_VERSION,snapshotId:snapshot.id,snapshotHash:snapshot.hash,provenance:{provider:"alpaca",feed:"sip",adjustment:snapshot.adjustment}};
  await app.store.db.query("INSERT INTO prepared_samples (id,manifest_json) VALUES ($1,$2)",[manifest.id,JSON.stringify(manifest)]);
  const created=await request(app,"POST","/api/samples/test-sample/cases",{requestId:"sample-request-1"});
  expect(created.status).toBe(201);
  const courtCase=created.body.case;
  const retry=await request(app,"POST","/api/samples/test-sample/cases",{requestId:"sample-request-1"});
  expect(retry.body.case.id).toBe(courtCase.id);
  expect(retry.body.case.versions).toHaveLength(1);
  const versionId=courtCase.versions[0].id;
  expect(courtCase.versions[0].confirmed).toBe(false);
  expect((await request(app,"POST",`/api/cases/${courtCase.id}/court-runs`,{strategyVersionId:versionId,dataSnapshotPolicy:"saved_sample"})).status).toBe(409);
  await request(app,"POST",`/api/cases/${courtCase.id}/strategy-versions/${versionId}/confirm`,{});
  const started=await request(app,"POST",`/api/cases/${courtCase.id}/court-runs`,{strategyVersionId:versionId,dataSnapshotPolicy:"saved_sample"});
  expect(started.status).toBe(202);
  await app.queue.idle();
  expect((await app.store.getRun(started.body.run.id,"test-user"))?.dataSnapshotId).toBe(snapshot.id);
  expect(calls).toBe(0);
  const replayPath=`/api/cases/${courtCase.id}/replay`;
  expect((await request(app,"POST",replayPath,{strategyVersionId:versionId})).body.error.code).toBe("sample_snapshot_missing");
  const generatedHoldout=await new FixtureMarketProvider().getSnapshot({symbols:sampleSettings.symbols,dateFrom:sampleSettings.dateFrom,dateTo:"2025-12-31"});
  const holdoutRequest={...generatedHoldout.request,testOnly:true,feed:"sip"};
  const holdout=await app.store.saveSnapshot({...generatedHoldout,provider:"alpaca",feed:"sip",request:holdoutRequest,hash:contentHash({request:holdoutRequest,bars:generatedHoldout.bars})});
  await app.store.db.query("UPDATE prepared_samples SET manifest_json=$2 WHERE id=$1",[manifest.id,JSON.stringify({...manifest,replaySnapshotId:holdout.id,replaySnapshotHash:holdout.hash})]);
  expect((await request(app,"POST",replayPath,{strategyVersionId:versionId,dataSnapshotPolicy:"invalid"})).status).toBe(422);
  const replay=await request(app,"POST",replayPath,{strategyVersionId:versionId});
  expect(replay.status).toBe(201);
  expect(calls).toBe(0);
  const report=(await request(app,"GET",`/api/reports/${started.body.run.id}`)).body.report;
  expect(report.dataMetadata.dateRange.end).toBe(sampleSettings.dateTo);
  expect(report.dataMetadata.snapshotHash).toBe(snapshot.hash);
  await app.store.db.query("UPDATE market_snapshots SET bars_json='[]'::jsonb WHERE id=$1",[snapshot.id]);
  expect((await request(app,"POST",`/api/cases/${courtCase.id}/court-runs`,{strategyVersionId:versionId,dataSnapshotPolicy:"saved_sample"})).status).toBe(409);
});

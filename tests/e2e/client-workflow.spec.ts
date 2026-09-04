import {test,expect,type APIRequestContext} from "@playwright/test";
import {randomUUID,createHash} from "node:crypto";
import pg from "pg";
import {baselineInput} from "../fixtures/intake-documents";
import {testAgreement} from "../fixtures/agreement";
import type {SavedEstimate} from "../../src/server/analysis";
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const origin="http://localhost:3100",headers={Origin:origin};
test.beforeEach(async()=>{await pool.query('DELETE FROM "LoginThrottle"');});
test.afterAll(async()=>{await pool.end();});
async function workspace(request:APIRequestContext){
  expect((await request.post('/api/auth/login',{headers,data:{password:process.env.TEST_PASSWORD}})).status()).toBe(200);
  const projectId=(await (await request.post('/api/projects',{headers,data:{name:`Client workflow ${randomUUID().slice(0,8)}`}})).json()).project.id;
  expect((await request.post(`/api/projects/${projectId}/baseline`,{headers,data:baselineInput()})).status()).toBe(201);
  return projectId;
}
async function analyzed(request:APIRequestContext,projectId:string){
  const r=(await (await request.post(`/api/projects/${projectId}/requests`,{headers,data:{text:'Add another responsive website page.',hourlyRatePaise:100000}})).json()).request;
  const response=await request.post(`/api/requests/${r.id}/analyze`,{headers,data:{idempotencyKey:randomUUID()}});expect(response.status()).toBe(200);
  return (await response.json()).estimate as SavedEstimate;
}
async function reviewed(request:APIRequestContext,estimate:SavedEstimate,agreement=testAgreement(estimate.draft)){
  const saved=await request.put(`/api/estimates/${estimate.id}/review`,{headers,data:{expectedRevision:estimate.currentRevision,draft:estimate.draft,agreement,editReason:'Review client-facing scope and budget.'}});expect(saved.status()).toBe(200);
  const next=(await saved.json()).estimate as SavedEstimate;
  const approved=await request.post(`/api/estimates/${estimate.id}/approve`,{headers,data:{expectedRevision:next.currentRevision,reviewed:true}});expect(approved.status()).toBe(200);
  return (await approved.json()).estimate as SavedEstimate;
}
async function offer(request:APIRequestContext,estimate:SavedEstimate,key=randomUUID()){
  const response=await request.post(`/api/estimates/${estimate.id}/proposal`,{headers,data:{expectedRevision:estimate.currentRevision,idempotencyKey:key}});expect(response.status()).toBe(200);
  const result=await response.json();
  const token=new URLSearchParams(new URL(result.link).hash.slice(1)).get('token')!;
  return {id:result.proposalId as string,token,link:result.link as string,auth:{...headers,Authorization:`Bearer ${token}`}};
}
async function ready(request:APIRequestContext){const projectId=await workspace(request),estimate=await reviewed(request,await analyzed(request,projectId));return {projectId,estimate,proposal:await offer(request,estimate)};}
const decision=(request:APIRequestContext,p:{id:string;auth:Record<string,string>},outcome='accept',key=randomUUID(),comment='Agreed.')=>request.post(`/api/client/proposals/${p.id}/decision`,{headers:p.auth,data:{decision:outcome,confirmed:true,idempotencyKey:key,comment}});
const action=(request:APIRequestContext,id:string,revision:number,name:string,key=randomUUID())=>request.post(`/api/proposals/${id}/${name}`,{headers,data:{expectedRevision:revision,idempotencyKey:key,confirmed:true}});

test('new mutation routes require their own credentials and trusted origins',async({request,playwright})=>{
  const {projectId,estimate,proposal:p}=await ready(request);
  const anonymous=await playwright.request.newContext({baseURL:origin});
  try {
    for(const path of [`/api/projects/${projectId}/intake-link`,`/api/estimates/${estimate.id}/proposal`,...['link','revoke','revise'].map(a=>`/api/proposals/${p.id}/${a}`)]){
      expect((await anonymous.post(path,{headers,data:{}})).status()).toBe(401);
      expect((await request.post(path,{headers:{Origin:'https://foreign.example'},data:{}})).status()).toBe(403);
    }
    expect((await anonymous.put(`/api/requests/${estimate.requestId}/rate`,{headers,data:{hourlyRatePaise:100000}})).status()).toBe(401);
    const data={decision:'accept',confirmed:true,idempotencyKey:randomUUID()};
    expect((await request.post(`/api/client/proposals/${p.id}/decision`,{headers,data})).status()).toBe(404);
    expect((await request.post(`/api/client/proposals/${p.id}/decision`,{headers:{...p.auth,Origin:'https://foreign.example'},data})).status()).toBe(403);
    expect((await request.get(`/api/client/proposals/${randomUUID()}`,{headers:p.auth})).status()).toBe(404);
    expect((await pool.query('SELECT COUNT(*)::int n FROM "ProjectDecision" WHERE "proposalId"=$1',[p.id])).rows[0].n).toBe(0);
  } finally {await anonymous.dispose();}
});

test('client intake is scoped, private, idempotent, rate-free and explicitly rate limited',async({request})=>{
  const projectId=await workspace(request),key=randomUUID();
  const created=await request.post(`/api/projects/${projectId}/intake-link`,{headers,data:{idempotencyKey:key}});expect(created.status()).toBe(200);
  const link=await created.json(),token=new URLSearchParams(new URL(link.link).hash.slice(1)).get('token')!,auth={...headers,Authorization:`Bearer ${token}`};
  const meta=await request.get(`/api/client/requests/${link.id}`,{headers:auth});expect(meta.status()).toBe(200);expect(Object.keys(await meta.json()).sort()).toEqual(['expiresAt','projectName']);
  expect((await request.get(`/api/client/requests/${randomUUID()}`,{headers:auth})).status()).toBe(404);
  expect((await request.get(`/api/client/requests/${link.id}`)).status()).toBe(404);
  expect((await request.post(`/api/client/requests/${link.id}`,{headers:{...auth,Origin:'https://foreign.example'},data:{text:'Another additional page.',idempotencyKey:randomUUID()}})).status()).toBe(403);
  for(const extra of [{hourlyRatePaise:1},{projectId:randomUUID()},{calculatedCostsPaise:0}])expect((await request.post(`/api/client/requests/${link.id}`,{headers:auth,data:{text:'Another additional page.',idempotencyKey:randomUUID(),...extra}})).status()).toBe(422);
  const submit={text:'Client requests another portfolio page.',idempotencyKey:randomUUID()};
  const responses=await Promise.all([request.post(`/api/client/requests/${link.id}`,{headers:auth,data:submit}),request.post(`/api/client/requests/${link.id}`,{headers:auth,data:submit})]);expect(responses.map(r=>r.status())).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());
  const row=(await pool.query('SELECT * FROM "ChangeRequest" WHERE "projectId"=$1',[projectId])).rows[0];expect(row.hourlyRatePaise).toBeNull();expect(row.origin).toBe('client');expect(row.requestNumber).toBe(1);
  const missing=await request.post(`/api/requests/${row.id}/analyze`,{headers,data:{idempotencyKey:randomUUID()}});expect(missing.status()).toBe(422);expect((await missing.json()).error.code).toBe('RATE_REQUIRED');
  expect((await request.post(`/api/client/requests/${link.id}`,{headers:auth,data:{...submit,text:'Different request text.'}})).status()).toBe(409);
  expect((await request.put(`/api/requests/${row.id}/rate`,{headers,data:{hourlyRatePaise:123456}})).status()).toBe(200);
  const result=await request.post(`/api/requests/${row.id}/analyze`,{headers,data:{idempotencyKey:randomUUID()}});expect(result.status()).toBe(200);
  expect((await request.put(`/api/requests/${row.id}/rate`,{headers,data:{hourlyRatePaise:200000}})).status()).toBe(409);
  await pool.query('UPDATE "ClientIntakeLink" SET "attempts"=10 WHERE "id"=$1',[link.id]);
  expect((await request.post(`/api/client/requests/${link.id}`,{headers:auth,data:{text:'Another independent new request.',idempotencyKey:randomUUID()}})).status()).toBe(429);
  const rotated=await request.post(`/api/projects/${projectId}/intake-link`,{headers,data:{idempotencyKey:randomUUID()}});expect(rotated.status()).toBe(200);
  expect((await request.get(`/api/client/requests/${link.id}`,{headers:auth})).status()).toBe(410);
  const stored=(await pool.query('SELECT "tokenHash" FROM "ClientIntakeLink" WHERE "id"=$1',[link.id])).rows[0].tokenHash;expect(stored===token).toBe(false);expect(stored===createHash('sha256').update(token).digest('hex')).toBe(true);
});

test('sharing requires complete approved terms and preserves the client allowlist and one fixed charge',async({request})=>{
  const projectId=await workspace(request),estimate=await analyzed(request,projectId);
  expect((await request.post(`/api/estimates/${estimate.id}/proposal`,{headers,data:{expectedRevision:1,idempotencyKey:randomUUID()}})).status()).toBe(409);
  const blocked=await request.post(`/api/estimates/${estimate.id}/approve`,{headers,data:{expectedRevision:1,reviewed:true}});expect(blocked.status()).toBe(422);expect((await blocked.json()).error.code).toBe('AGREEMENT_REQUIRED');
  estimate.draft.additionalChargePaise=50000;estimate.draft.additionalChargeReason='One-time configuration.';
  estimate.draft.analysis.tasks[0].risks=['Internal risk sentinel'];
  const saved=await reviewed(request,estimate),key=randomUUID(),p=await offer(request,saved,key);
  const repeat=await request.post(`/api/estimates/${estimate.id}/proposal`,{headers,data:{expectedRevision:saved.currentRevision,idempotencyKey:key}});expect(repeat.status()).toBe(200);expect((await repeat.json()).link).toBeNull();
  const read=await request.get(`/api/client/proposals/${p.id}`,{headers:p.auth});expect(read.status()).toBe(200);
  const value=await read.json();expect(value.offer.calculated.totalChargePaise.likely).toBe(250000);expect(value.offer.additionalChargeReason).toBe('One-time configuration.');
  const text=JSON.stringify(value);for(const field of ['originalAiJson','originalInputJson','Internal risk sentinel','editReason','promptVersion','tokenHash','"reviewed":'])expect(text.includes(field)).toBe(false);
  expect(read.headers()['cache-control']).toBe('no-store');expect(read.headers()['referrer-policy']).toBe('no-referrer');
  expect((await request.get(`/api/client/proposals/${p.id}`)).status()).toBe(404);
  expect((await request.get(`/api/client/proposals/${randomUUID()}`,{headers:p.auth})).status()).toBe(404);
  expect((await pool.query('SELECT count(*)::int n FROM "ProjectDecision" WHERE "projectId"=$1',[projectId])).rows[0].n).toBe(0);
  const rotated=await action(request,p.id,saved.currentRevision,'link');expect(rotated.status()).toBe(200);
  expect((await decision(request,p)).status()).toBe(404);
  await expect(pool.query('UPDATE "Proposal" SET "snapshotJson"=\'{}\' WHERE "id"=$1',[p.id])).rejects.toMatchObject({code:'23514'});
});

test('accepted decisions are idempotent and atomically add scope and billing exactly once',async({request})=>{
  const {projectId,estimate,proposal:p}=await ready(request),key=randomUUID();
  expect((await request.post(`/api/client/proposals/${p.id}/decision`,{headers:p.auth,data:{decision:'accept',confirmed:false,comment:'',idempotencyKey:key}})).status()).toBe(422);
  expect((await request.post(`/api/client/proposals/${p.id}/decision`,{headers:p.auth,data:{decision:'accept',confirmed:true,comment:'',idempotencyKey:key,totalChargePaise:0}})).status()).toBe(422);
  const responses=await Promise.all([decision(request,p,'accept',key),decision(request,p,'accept',key)]);expect(responses.map(r=>r.status())).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());
  expect((await decision(request,p,'accept',key,'Changed comment.')).status()).toBe(409);
  const repeated=await decision(request,p,'accept',randomUUID(),'New comment ignored.');expect(repeated.status()).toBe(200);expect((await repeated.json()).decision.comment).toBe('Agreed.');
  expect((await decision(request,p,'decline')).status()).toBe(409);
  const history=(await (await request.get(`/api/projects/${projectId}/history`)).json()).history;expect(history.summary.acceptedAdditionalPaise.likely).toBe('200000');expect(history.summary.pendingAdditionalPaise.likely).toBe('0');expect(history.summary.totalRequests).toBe(1);
  expect((await pool.query('SELECT "scopeRevision" FROM "Project" WHERE "id"=$1',[projectId])).rows[0].scopeRevision).toBe(1);
  const next=await analyzed(request,projectId);expect(next.sources.some(s=>s.sourceType==='accepted_change_clause')).toBe(true);
  expect((await action(request,p.id,estimate.currentRevision,'revise')).status()).toBe(409);
  await expect(pool.query('UPDATE "ProjectDecision" SET "finalDecisionText"=\'changed\' WHERE "proposalId"=$1',[p.id])).rejects.toMatchObject({code:'23514'});
  await expect(pool.query('DELETE FROM "Proposal" WHERE "id"=$1',[p.id])).rejects.toMatchObject({code:'23514'});
});

test('correction revokes the old offer and requires a new immutable review and approval',async({request})=>{
  const {projectId,estimate,proposal:p}=await ready(request);
  const before=(await pool.query('SELECT "snapshotJson" FROM "Proposal" WHERE "id"=$1',[p.id])).rows[0];
  expect((await action(request,p.id,estimate.currentRevision,'revise')).status()).toBe(200);
  expect((await decision(request,p)).status()).toBe(410);
  expect((await request.post(`/api/estimates/${estimate.id}/approve`,{headers,data:{expectedRevision:estimate.currentRevision,reviewed:true}})).status()).toBe(409);
  expect((await request.post(`/api/estimates/${estimate.id}/proposal`,{headers,data:{expectedRevision:estimate.currentRevision,idempotencyKey:randomUUID()}})).status()).toBe(409);
  const current=(await (await request.get(`/api/estimates/${estimate.id}`)).json()).estimate as SavedEstimate;current.draft.hourlyRatePaise=150000;
  const replacement=await offer(request,await reviewed(request,current));expect(replacement.id).not.toBe(p.id);
  expect((await pool.query('SELECT "snapshotJson" FROM "Proposal" WHERE "id"=$1',[p.id])).rows[0]).toEqual(before);
  expect((await pool.query('SELECT "replacesProposalId" FROM "Proposal" WHERE "id"=$1',[replacement.id])).rows[0].replacesProposalId).toBe(p.id);
  expect((await decision(request,replacement)).status()).toBe(200);
  const summary=(await (await request.get(`/api/projects/${projectId}/history`)).json()).history.summary;expect(summary.totalRequests).toBe(1);expect(summary.additionalRequests).toBe(1);expect(summary.acceptedAdditionalPaise.likely).toBe('300000');
});

test('acceptance versus correction has one transaction winner',async({request})=>{
  const {estimate,proposal:p}=await ready(request);
  const result=await Promise.all([decision(request,p),action(request,p.id,estimate.currentRevision,'revise')]);
  const statuses=result.map(r=>r.status());expect(statuses.filter(s=>s===200)).toHaveLength(1);expect(statuses.some(s=>s===409||s===410)).toBe(true);
  const row=(await pool.query('SELECT "status" FROM "Proposal" WHERE "id"=$1',[p.id])).rows[0];const count=(await pool.query('SELECT count(*)::int n FROM "ProjectDecision" WHERE "proposalId"=$1',[p.id])).rows[0].n;expect(count).toBe(row.status==='ACCEPTED'?1:0);
});

test('opposite decisions and competing project offers cannot overwrite a winner',async({request})=>{
  const {projectId,proposal:p}=await ready(request),second=await offer(request,await reviewed(request,await analyzed(request,projectId)));
  const results=await Promise.all([decision(request,p),decision(request,p,'decline')]);expect(results.map(r=>r.status()).sort()).toEqual([200,409]);
  const outcome=(await pool.query('SELECT "status" FROM "Proposal" WHERE "id"=$1',[p.id])).rows[0].status;
  expect((await decision(request,second)).status()).toBe(outcome==='ACCEPTED'?409:200);
  const third=await offer(request,await reviewed(request,await analyzed(request,projectId))),fourth=await offer(request,await reviewed(request,await analyzed(request,projectId)));
  const competing=await Promise.all([decision(request,third),decision(request,fourth)]);expect(competing.map(r=>r.status()).sort()).toEqual([200,409]);
});

test('expiry prevents decisions, and decline and IN_SCOPE acceptance do not change scope',async({request})=>{
  const {projectId,proposal:p}=await ready(request);
  await pool.query('UPDATE "Proposal" SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE "id"=$1',[p.id]);expect((await decision(request,p)).status()).toBe(410);
  const d=await offer(request,await reviewed(request,await analyzed(request,projectId)));expect((await decision(request,d,'decline')).status()).toBe(200);
  expect((await pool.query('SELECT "scopeRevision" FROM "Project" WHERE "id"=$1',[projectId])).rows[0].scopeRevision).toBe(0);
  const estimate=await analyzed(request,projectId);estimate.draft.analysis.tasks[0].classification='IN_SCOPE';estimate.draft.analysis.tasks[0].estimatedHours={minimum:0,likely:0,maximum:0};estimate.draft.analysis.tasks[0].matchedScopeClause!.relation='inclusion';
  const free=await offer(request,await reviewed(request,estimate));expect((await decision(request,free)).status()).toBe(200);
  const row=(await pool.query('SELECT "amendmentClausesJson" FROM "ProjectDecision" WHERE "proposalId"=$1',[free.id])).rows[0];expect(row.amendmentClausesJson.clauses).toEqual([]);
  expect((await pool.query('SELECT "scopeRevision" FROM "Project" WHERE "id"=$1',[projectId])).rows[0].scopeRevision).toBe(0);
});

test('declined replacement does not consume whole-decision supersession; accepted replacement controls future scope',async({request})=>{
  const {projectId,proposal:p}=await ready(request);expect((await decision(request,p)).status()).toBe(200);
  const original=(await pool.query('SELECT "id" FROM "ProjectDecision" WHERE "proposalId"=$1',[p.id])).rows[0].id;
  async function replacement(){const e=await analyzed(request,projectId),terms=testAgreement(e.draft);terms.supersedesDecisionId=original;terms.clauses[0].text='The complete replacement agreement includes seven pages and retains the contact form.';return offer(request,await reviewed(request,e,terms));}
  const declined=await replacement();expect((await decision(request,declined,'decline')).status()).toBe(200);
  expect((await pool.query('SELECT "supersedesDecisionId" FROM "ProjectDecision" WHERE "proposalId"=$1',[declined.id])).rows[0].supersedesDecisionId).toBeNull();
  const accepted=await replacement();expect((await decision(request,accepted)).status()).toBe(200);
  const next=await analyzed(request,projectId);expect(next.sources.some(s=>s.sourceId.startsWith(original+':'))).toBe(false);expect(next.sources.some(s=>s.text.includes('complete replacement agreement'))).toBe(true);
  expect((await (await request.get(`/api/projects/${projectId}/history`)).json()).history.summary.acceptedAdditionalPaise.likely).toBe('400000');
});

test('each failed decision write rolls back decision, scope, offer, audit and receipt',async({request})=>{
  const {projectId,proposal:p}=await ready(request);
  const stages=[['ProjectDecision','INSERT',`NEW."proposalId"::text='${p.id}'`],['Project','UPDATE',`NEW."id"::text='${projectId}'`],['Proposal','UPDATE',`NEW."id"::text='${p.id}'`],['AuditEvent','INSERT',`NEW."entityId"::text='${p.id}' AND NEW."action"='client_accepted'`],['OperationReceipt','INSERT',`NEW."scope"='decision:${p.id}'`]];
  for(const [table,event,condition] of stages){
    await pool.query(`CREATE FUNCTION test_decision_fail() RETURNS trigger AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_decision_fail BEFORE ${event} ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_decision_fail();`);
    try{
      expect((await decision(request,p)).status()).toBe(503);
      expect((await pool.query('SELECT count(*)::int n FROM "ProjectDecision" WHERE "proposalId"=$1',[p.id])).rows[0].n).toBe(0);
      expect((await pool.query('SELECT "status" FROM "Proposal" WHERE "id"=$1',[p.id])).rows[0].status).toBe('PENDING');
      expect((await pool.query('SELECT "scopeRevision" FROM "Project" WHERE "id"=$1',[projectId])).rows[0].scopeRevision).toBe(0);
      expect((await pool.query('SELECT count(*)::int n FROM "AuditEvent" WHERE "entityId"=$1 AND "action"=\'client_accepted\'',[p.id])).rows[0].n).toBe(0);
      expect((await pool.query('SELECT count(*)::int n FROM "OperationReceipt" WHERE "scope"=$1',[`decision:${p.id}`])).rows[0].n).toBe(0);
    }finally{await pool.query(`DROP TRIGGER test_decision_fail ON "${table}"; DROP FUNCTION test_decision_fail();`);}
  }
  expect((await decision(request,p)).status()).toBe(200);
});

test('client desktop/mobile intake and explicit acceptance keep credentials out of server URLs and storage',async({request,browser})=>{
  test.setTimeout(120000);
  for(const width of [1440,390]){
    const projectId=await workspace(request);
    const created=await request.post(`/api/projects/${projectId}/intake-link`,{headers,data:{idempotencyKey:randomUUID()}}),link=await created.json();
    const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),urls:string[]=[];
    page.on('request',r=>urls.push(r.url()));
    await page.goto(link.link);await page.getByLabel('What would you like to change?').fill('Please add another responsive portfolio page.');await page.getByRole('button',{name:'Submit request',exact:true}).press('Enter');await expect(page.getByRole('heading',{name:'Request #1 received'})).toBeVisible();
    const row=(await pool.query('SELECT "id" FROM "ChangeRequest" WHERE "projectId"=$1',[projectId])).rows[0];await request.put(`/api/requests/${row.id}/rate`,{headers,data:{hourlyRatePaise:100000}});
    const analyzedResponse=await request.post(`/api/requests/${row.id}/analyze`,{headers,data:{idempotencyKey:randomUUID()}});expect(analyzedResponse.status()).toBe(200);
    const estimate=await reviewed(request,(await analyzedResponse.json()).estimate),p=await offer(request,estimate);
    await page.goto(p.link);await expect(page.getByRole('button',{name:'Accept offer',exact:true})).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/client-offer-${width}.png`,fullPage:true});
    await page.getByLabel('Comment (optional)').fill('Please proceed.');await page.getByRole('checkbox').press('Space');await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Accept offer',exact:true})).toBeFocused();await page.keyboard.press('Enter');
    await expect(page.getByRole('heading',{name:'Offer accepted',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Offer accepted',exact:true})).toBeVisible();
    await page.screenshot({path:`test-results/client-accepted-${width}.png`,fullPage:true});
    expect(urls.some(url=>url.includes(p.token)||url.includes('token='))).toBe(false);expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
    await context.close();
  }
});

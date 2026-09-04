import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import pg from "pg";
test('Milestone 5 migration upgrades preserved records and supports a fresh schema',async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL}),client=await pool.connect();
  const schema=`migration_test_${randomUUID().replaceAll('-','')}`;
  try{
    await client.query('BEGIN');await client.query(`CREATE SCHEMA "${schema}"`);await client.query(`SET LOCAL search_path TO "${schema}"`);
    for(const name of ['202609040001_foundation','202609040002_intake','202609040003_analysis','202609040004_review'])await client.query(readFileSync(`prisma/migrations/${name}/migration.sql`,'utf8'));
    const [project,r,e,v,p]=Array.from({length:5},()=>randomUUID());
    await client.query('INSERT INTO "Project" ("id","name") VALUES ($1,\'Upgrade check\')',[project]);
    await client.query('INSERT INTO "ChangeRequest" ("id","projectId","text","hourlyRatePaise","basedOnScopeRevision") VALUES ($1,$2,\'Preserve this submitted request.\',100000,0)',[r,project]);
    await client.query('INSERT INTO "Estimate" ("id","requestId","originalAiJson","originalInputJson","originalCalculatedJson","provider","model","promptVersion","currentRevision") VALUES ($1,$2,\'{"original":true}\',\'{"scope":true}\',\'{"price":123}\',\'test\',\'test\',\'test\',1)',[e,r]);
    await client.query('INSERT INTO "EstimateRevision" ("id","estimateId","revision","snapshotJson","createdBy") VALUES ($1,$2,1,\'{"saved":true}\',\'freelancer\')',[v,e]);
    await client.query('UPDATE "Estimate" SET "status"=\'APPROVED\',"approvedRevisionId"=$1 WHERE "id"=$2',[v,e]);
    await client.query('INSERT INTO "Proposal" ("id","projectId","estimateId","approvedRevisionId","snapshotJson","basedOnScopeRevision","expiresAt") VALUES ($1,$2,$3,$4,\'{"frozen":true}\',0,NOW()+INTERVAL \'1 day\')',[p,project,e,v]);
    const before=(await client.query('SELECT "originalAiJson","originalInputJson","originalCalculatedJson","approvedRevisionId" FROM "Estimate" WHERE "id"=$1',[e])).rows[0];
    await client.query(readFileSync('prisma/migrations/202609040005_client_workflow/migration.sql','utf8'));
    expect((await client.query('SELECT "originalAiJson","originalInputJson","originalCalculatedJson","approvedRevisionId" FROM "Estimate" WHERE "id"=$1',[e])).rows[0]).toEqual(before);
    expect((await client.query('SELECT "currentProposalId" FROM "Estimate" WHERE "id"=$1',[e])).rows[0].currentProposalId).toBe(p);
    expect((await client.query('SELECT "requestNumber","origin","text" FROM "ChangeRequest" WHERE "id"=$1',[r])).rows[0]).toEqual({requestNumber:1,origin:'freelancer',text:'Preserve this submitted request.'});
    expect((await client.query('SELECT "snapshotJson" FROM "EstimateRevision" WHERE "id"=$1',[v])).rows[0].snapshotJson).toEqual({saved:true});
    expect((await client.query('SELECT "snapshotJson" FROM "Proposal" WHERE "id"=$1',[p])).rows[0].snapshotJson).toEqual({frozen:true});
    await client.query('INSERT INTO "ClientIntakeLink" ("id","projectId","tokenHash","expiresAt") VALUES ($1,$2,\'hash-only\',NOW()+INTERVAL \'1 day\')',[randomUUID(),project]);
    expect((await client.query('SELECT count(*)::int n FROM "ClientIntakeLink"')).rows[0].n).toBe(1);
  }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});

import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";

test("account migration preserves existing project data and enforces immutable ownership", async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  const schema = `account_migration_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}"`);
    for (const name of [
      "202609040001_foundation",
      "202609040002_intake",
      "202609040003_analysis",
      "202609040004_review",
      "202609040005_client_workflow",
    ]) await client.query(readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8"));

    const projectId = randomUUID(), baselineId = randomUUID(), oldSessionId = randomUUID();
    await client.query('INSERT INTO "Project" ("id","name") VALUES ($1,$2)', [projectId, "Preserved account migration project"]);
    await client.query('INSERT INTO "Baseline" ("id","projectId","text","clausesJson","contentHash","confirmedAt","confirmedBy") VALUES ($1,$2,$3,$4,$5,NOW(),$6)', [baselineId, projectId, "Preserve this baseline.", { schemaVersion: 1, clauses: [] }, "preserved-hash", "freelancer"]);
    await client.query('INSERT INTO "WorkspaceSession" ("id","credentialVersion","expiresAt") VALUES ($1,$2,NOW()+INTERVAL \'1 hour\')', [oldSessionId, "legacy"]);
    const before = (await client.query('SELECT p."name",b."text",b."contentHash" FROM "Project" p JOIN "Baseline" b ON b."projectId"=p."id" WHERE p."id"=$1', [projectId])).rows[0];

    await client.query(readFileSync("prisma/migrations/202609040006_user_accounts/migration.sql", "utf8"));
    expect((await client.query('SELECT p."name",b."text",b."contentHash" FROM "Project" p JOIN "Baseline" b ON b."projectId"=p."id" WHERE p."id"=$1', [projectId])).rows[0]).toEqual(before);
    expect((await client.query('SELECT count(*)::int AS n FROM "WorkspaceSession"')).rows[0].n).toBe(0);
    expect((await client.query('SELECT "ownerId" FROM "Project" WHERE "id"=$1', [projectId])).rows[0].ownerId).toBeNull();

    const ownerId = randomUUID();
    await client.query('INSERT INTO "User" ("id","email","passwordHash") VALUES ($1,$2,$3)', [ownerId, "first@example.com", "argon2id-hash"]);
    await client.query('UPDATE "Project" SET "ownerId"=$1 WHERE "ownerId" IS NULL', [ownerId]);
    expect((await client.query('SELECT "ownerId" FROM "Project" WHERE "id"=$1', [projectId])).rows[0].ownerId).toBe(ownerId);
    await client.query('INSERT INTO "WorkspaceSession" ("id","credentialVersion","expiresAt","userId") VALUES ($1,$2,NOW()+INTERVAL \'1 hour\',$3)', [randomUUID(), "current", ownerId]);

    await client.query("SAVEPOINT immutable_owner");
    await expect(client.query('UPDATE "Project" SET "ownerId"=$1 WHERE "id"=$2', [randomUUID(), projectId])).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT immutable_owner");
    await client.query("SAVEPOINT missing_owner");
    await expect(client.query('INSERT INTO "Project" ("id","name") VALUES ($1,$2)', [randomUUID(), "Owner required"])).rejects.toMatchObject({ code: "23514" });
    await client.query("ROLLBACK TO SAVEPOINT missing_owner");
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});

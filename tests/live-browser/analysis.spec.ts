import { test, expect } from '@playwright/test';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
test('real Featherless analysis is saved and visible with valid evidence on desktop and mobile',async({page})=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try { await pool.query('DELETE FROM "LoginThrottle"'); } finally { await pool.end(); }
  const origin='http://localhost:3300';
  await page.goto('/login');await page.getByLabel('Workspace password').fill(process.env.TEST_PASSWORD!);await page.getByRole('button',{name:'Open workspace'}).click();await expect(page.getByRole('heading',{name:'Your projects',exact:true})).toBeVisible();
  await page.getByLabel('Project name',{exact:true}).fill(`Live verification ${randomUUID().slice(0,8)}`);await page.getByRole('button',{name:'Create project'}).click();
  await page.getByRole('link',{name:'Baseline',exact:true}).click();
  await page.getByLabel('Agreement text',{exact:true}).fill('Build exactly five responsive website pages.\n\nInclude a contact form with name, email and message fields, required-field validation and delivery to one supplied inbox.\n\nCustomer accounts, login and password reset are explicitly excluded.');
  await page.getByRole('button',{name:'Review clauses',exact:true}).click();await page.getByLabel('This clause describes a concrete deliverable.',{exact:true}).first().check();await page.getByLabel(/I have reviewed all text and clauses/).check();await page.getByRole('button',{name:'Confirm baseline',exact:true}).click();
  await page.getByRole('link',{name:'Add a request',exact:true}).click();
  await page.getByLabel('What has the client requested?').fill('Increase the website from five to eight pages. Add customer accounts with login and password reset. Include the contact form exactly as agreed.');await page.getByLabel('Hourly rate (INR)').fill('1000');await page.getByRole('button',{name:'Save request',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Request saved'})).toBeVisible();
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/analyze')&&r.request().method()==='POST',{timeout:125000});
  await page.getByRole('button',{name:'Analyze Request',exact:true}).click();
  const response=await responsePromise;const body=await response.json();expect(response.status(),body.error?.code??'analysis response').toBe(200);
  const estimate=body.estimate;expect(estimate.provenance.provider).toBe('featherless');expect(estimate.provenance.model).toBeTruthy();
  const categories=new Set(estimate.analysis.tasks.map((t:{classification:string})=>t.classification));expect(categories.has('covered')).toBe(true);expect(categories.has('out_of_scope')).toBe(true);expect(categories.has('modifies_existing')).toBe(true);
  await expect(page.getByRole('heading',{name:'Scope analysis',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Scope analysis',exact:true})).toBeVisible();
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.local/live-browser-results/live-analysis-${viewport.width}.png`,fullPage:true});}
  await page.getByRole('link',{name:/Original baseline ·/}).first().click();await expect(page).toHaveURL(/#source-/);
  // Read through the authenticated browser request context so no raw cookie/token is recorded.
  const saved=await page.request.get(`/api/estimates/${estimate.id}`,{headers:{Origin:origin}});expect(saved.status()).toBe(200);expect((await saved.json()).estimate.analysis).toEqual(estimate.analysis);
  console.log(`LIVE PASS: ${estimate.analysis.tasks.length} tasks; categories ${[...categories].join(', ')}; model ${estimate.provenance.model}; saved estimate ${estimate.id}`);
});

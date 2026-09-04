import { calculatePricing } from "../../src/lib/pricing";
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
  const categories=new Set(estimate.analysis.tasks.map((t:{classification:string})=>t.classification));expect(categories.has('IN_SCOPE')).toBe(true);expect(categories.has('NEW_FEATURE')).toBe(true);expect(categories.has('MODIFICATION')).toBe(true);
  await expect(page.getByRole('heading',{name:'Scope analysis',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Scope analysis',exact:true})).toBeVisible();
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){await page.setViewportSize(viewport);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.local/live-browser-results/live-analysis-${viewport.width}.png`,fullPage:true});}
  await page.getByRole('link',{name:/Original baseline ·/}).first().click();await expect(page).toHaveURL(/#source-/);
  // Read through the authenticated browser request context so no raw cookie/token is recorded.
  const saved=await page.request.get(`/api/estimates/${estimate.id}`,{headers:{Origin:origin}});expect(saved.status()).toBe(200);expect((await saved.json()).estimate.analysis).toEqual(estimate.analysis);
  await page.goto(`/projects/${estimate.projectId}/estimates/${estimate.id}`);
  await page.getByRole('button',{name:'Edit review',exact:true}).click();
  await page.getByLabel('Hourly rate (INR)',{exact:true}).fill('1500');
  await page.getByLabel('Fixed additional charge (INR)',{exact:true}).fill('500');
  await page.getByLabel('Additional charge reason (client-facing)',{exact:true}).fill('One-time configuration requested for this change.');
  const reviewedResponse=page.waitForResponse(r=>r.url().endsWith('/review')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'Save review',exact:true}).click();
  const reviewed=await reviewedResponse;expect(reviewed.status()).toBe(200);
  const reviewedEstimate=(await reviewed.json()).estimate;
  expect(reviewedEstimate.calculated).toEqual(calculatePricing({...estimate.draft,hourlyRatePaise:150000,additionalChargePaise:50000,additionalChargeReason:'One-time configuration requested for this change.'}));
  await page.getByLabel(/I have reviewed the scope, evidence, assumptions, hours and price/).check();
  await page.getByRole('button',{name:'Approve estimate',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Human-approved · Revision 2',exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:'Human-approved · Revision 2',exact:true})).toBeVisible();
  for(const width of [1440,390]){await page.setViewportSize({width,height:width===1440?1000:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`.local/live-browser-results/live-review-${width}.png`,fullPage:true});}
  console.log(`LIVE REVIEW PASS: saved revision 2, exact calculated prices, internal approval and reload verified.`);
  console.log(`LIVE PASS: ${estimate.analysis.tasks.length} tasks; categories ${[...categories].join(', ')}; model ${estimate.provenance.model}; saved estimate ${estimate.id}`);
});

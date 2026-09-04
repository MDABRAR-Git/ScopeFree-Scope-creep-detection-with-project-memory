import { expect,it } from "vitest";
import { emptyAgreement,validateAgreement,type Agreement } from "../src/lib/agreement";
import { caseInput,scopeCases } from "./evaluation/scope-cases";
import { analysisOutputSchema } from "../src/lib/contracts";
import { newCredential,hashValue,checkCredential,tokenHashFromRequest } from "../src/server/client-access";
const input=caseInput(scopeCases[0]);
const analysis=analysisOutputSchema.parse({schemaVersion:1,explanation:"Change the page limit.",tasks:[{id:"T1",title:"Page count",classification:"MODIFICATION",matchedScopeClause:null,sourceEvidence:[],estimatedHours:{minimum:1,likely:2,maximum:3},assumptions:[],complexity:"Simple",risks:[],missingInformation:[],explanation:"Change an existing limit."}]});
it("requires explicit terms and source selections before approving modifications",()=>{
  expect(()=>validateAgreement(emptyAgreement(),analysis,input.sources)).not.toThrow();
  expect(()=>validateAgreement(emptyAgreement(),analysis,input.sources,true)).toThrow("Record client-facing");
  const agreement:Agreement={clauses:[{id:"A1",taskIds:["T1"],text:"The new agreed page count is eight.",amendsSourceIds:[]}],supersedesDecisionId:null};
  expect(()=>validateAgreement(agreement,analysis,input.sources,true)).toThrow("Identify the existing");
  agreement.clauses[0].amendsSourceIds.push(input.sources[0].sourceId);
  expect(validateAgreement(agreement,analysis,input.sources,true)).toEqual(agreement);
});
it("rejects foreign task/source references, duplicate clauses and artificial IN_SCOPE amendments",()=>{
  const agreement={clauses:[{id:"A1",taskIds:["T1"],text:"New limit.",amendsSourceIds:[input.sources[0].sourceId]}],supersedesDecisionId:null};
  expect(()=>validateAgreement({...agreement,clauses:[{...agreement.clauses[0],taskIds:["foreign"]}]},analysis,input.sources)).toThrow();
  expect(()=>validateAgreement({...agreement,clauses:[{...agreement.clauses[0],amendsSourceIds:["foreign"]}]},analysis,input.sources)).toThrow();
  expect(()=>validateAgreement({...agreement,clauses:[...agreement.clauses,...agreement.clauses]},analysis,input.sources)).toThrow();
  const covered=structuredClone(analysis);covered.tasks[0].classification="IN_SCOPE";
  expect(()=>validateAgreement(agreement,covered,input.sources)).toThrow();
});
it("generates independent 256-bit credentials and validates expiry/revocation without exposing tokens",()=>{
  const a=newCredential(),b=newCredential();expect(a.token).toHaveLength(43);expect(a.token).not.toBe(b.token);expect(a.tokenHash).toBe(hashValue(a.token));expect(a.tokenHash).not.toContain(a.token);
  expect(tokenHashFromRequest(new Request("https://example.test/api/client/proposals/id",{headers:{Authorization:`Bearer ${a.token}`}}))).toBe(a.tokenHash);
  const row={tokenHash:a.tokenHash,expiresAt:new Date(Date.now()+10000),revokedAt:null};
  expect(()=>checkCredential(row,b.tokenHash)).toThrow("not valid");
  expect(()=>checkCredential({...row,revokedAt:new Date()},a.tokenHash)).toThrow("revoked");
  expect(()=>checkCredential({...row,expiresAt:new Date(0)},a.tokenHash)).toThrow("expired");
  expect(()=>tokenHashFromRequest(new Request("https://example.test"))).toThrow("not valid");
});

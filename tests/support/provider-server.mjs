// Test-only HTTP provider. It is never imported by application/runtime code.
import http from 'node:http';
export function startTestProvider(port = 3199) {
  const server = http.createServer(async (req,res) => {
   try {
    if(req.url !== '/v1/chat/completions') {res.writeHead(404).end();return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    // Chat requests carry a { question, evidence } user message somewhere in the transcript; scope
    // requests carry { request, sources }. Scan all messages so a repair turn (a plain-text follow-up)
    // still routes to the chat branch instead of being misread as a scope request.
    let chat=null; for(const m of body.messages){ try{ const p=JSON.parse(m.content); if(p && typeof p.question==='string') chat=p; }catch{} }
    if(chat){
      const q=chat.question, ev=chat.evidence||{};
      if(q.includes('[OUTAGE]')){res.writeHead(503).end('{}');return;}
      if(q.includes('[RATE]')){res.writeHead(429).end('{}');return;}
      let out;
      if(q.includes('[INSUFFICIENT]')) out={answer:'No saved project record supports an answer to that.',citations:[],insufficientEvidence:true};
      else if(q.includes('[BADCITE_ALWAYS]')) out={answer:'Fabricated citation for validation.',citations:[{sourceType:'decision',sourceId:'00000000-0000-0000-0000-000000000000',quote:'not a real quote'}],insufficientEvidence:false};
      else if(q.includes('[BADCITE]') && body.messages.length===2) out={answer:'Fabricated citation for validation.',citations:[{sourceType:'decision',sourceId:'00000000-0000-0000-0000-000000000000',quote:'not a real quote'}],insufficientEvidence:false};
      else {
        const decision=(ev.decisions||[])[0], clause=(ev.baselineClauses||[])[0];
        if(decision) out={answer:`The recorded decision states: ${decision.finalDecisionText}`,citations:[{sourceType:'decision',sourceId:decision.sourceId,quote:decision.finalDecisionText.slice(0,40)}],insufficientEvidence:false};
        else if(clause) out={answer:`The baseline includes: ${clause.text}`,citations:[{sourceType:'baseline_clause',sourceId:clause.sourceId,quote:clause.text.slice(0,30)}],insufficientEvidence:false};
        else out={answer:'No saved project record supports an answer to that.',citations:[],insufficientEvidence:true};
      }
      res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({model:'test-only-provider',choices:[{message:{content:JSON.stringify(out)},finish_reason:'stop'}]}));
      return;
    }
    const input=JSON.parse(body.messages[1].content);
    if(input.request.includes('[SLOW]')) await new Promise(resolve=>setTimeout(resolve,900));
    if(input.request.includes('[OUTAGE]')){res.writeHead(503).end('{}');return;}
    if(input.request.includes('[RATE]')){res.writeHead(429).end('{}');return;}
    const source=input.sources[0];
    const task={id:'T1',title:'Additional project page',classification:'MODIFICATION',matchedScopeClause:{sourceType:source.sourceType,sourceId:source.sourceId,relation:'limit'},sourceEvidence:[{sourceType:source.sourceType,sourceId:source.sourceId,quote:source.text}],estimatedHours:{minimum:1,likely:2,maximum:3},assumptions:['Client supplies the page content.'],complexity:'One static page using existing styles.',risks:['Content may need clarification.'],missingInformation:[],explanation:'The additional page increases the agreed page count.'};
    const bad = input.request.includes('[INVALID]') || (input.request.includes('[REPAIR]') && body.messages.length===2);
    const content=bad?'invalid JSON':JSON.stringify({schemaVersion:1,tasks:[task],explanation:'The request changes an agreed quantity.'});
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({model:'test-only-provider',choices:[{message:{content},finish_reason:'stop'}]}));
   } catch { try{ res.writeHead(500).end('{}'); }catch{} } // never crash the test provider process
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}

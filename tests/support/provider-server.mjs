// Test-only HTTP provider. It is never imported by application/runtime code.
import http from 'node:http';
export function startTestProvider(port = 3199) {
  const server = http.createServer(async (req,res) => {
    if(req.url !== '/v1/chat/completions') {res.writeHead(404).end();return;}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    const input=JSON.parse(body.messages[1].content);
    if(input.request.includes('[SLOW]')) await new Promise(resolve=>setTimeout(resolve,900));
    if(input.request.includes('[OUTAGE]')){res.writeHead(503).end('{}');return;}
    if(input.request.includes('[RATE]')){res.writeHead(429).end('{}');return;}
    const source=input.sources[0];
    const task={id:'T1',title:'Additional project page',classification:'MODIFICATION',matchedScopeClause:{sourceType:source.sourceType,sourceId:source.sourceId,relation:'limit'},sourceEvidence:[{sourceType:source.sourceType,sourceId:source.sourceId,quote:source.text}],estimatedHours:{minimum:1,likely:2,maximum:3},assumptions:['Client supplies the page content.'],complexity:'One static page using existing styles.',risks:['Content may need clarification.'],missingInformation:[],explanation:'The additional page increases the agreed page count.'};
    const bad = input.request.includes('[INVALID]') || (input.request.includes('[REPAIR]') && body.messages.length===2);
    const content=bad?'invalid JSON':JSON.stringify({schemaVersion:1,tasks:[task],explanation:'The request changes an agreed quantity.'});
    res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({model:'test-only-provider',choices:[{message:{content},finish_reason:'stop'}]}));
  });
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}

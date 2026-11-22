const assert = require('node:assert/strict');
const Net = require('../js/net.js');
const pid = 'p-aaaaaaaa-bbbbbbbb-cccccccc';
const token = 'a'.repeat(64);
const calls = [], s = {};
let expected = 10;
const fetch = async (url, req) => {
  const body = req.body ? JSON.parse(req.body) : {};
  calls.push({url,req,body});
  let code=200, json={};
  if (url.endsWith('/account/login')) json={pid,token,snapshot:JSON.stringify({pid,wins:3}),version:10};
  if (url.endsWith('/snapshot') && req.method==='PUT') {
    if (body.expectedVersion !== expected) { code=409; json={serverVersion:expected}; }
    else { json={version:body.version};expected=body.version; }
  }
  if (url.endsWith('/snapshot') && req.method==='GET') json={version:expected,snapshot:JSON.stringify({pid,wins:4})};
  return {status:code,json:async()=>json};
};
(async()=>{
  const env={fetch,serverUrl:'https://game.test',guest:'g'.repeat(40),getPid:()=>pid,lastVersion:0,
    accountSession:null,persistAccount:v=>s.account=v,saveVersion:v=>s.version=v};
  const net=Net.create(env,{platform:'site'});await net.init();
  const auth=await net.remote.accountLogin('test@example.com','password123456');
  assert.equal(auth.code,200);assert.deepEqual(auth.json.pid,pid);
  assert.equal(net.remote.activateAccount(auth.json),true);assert.equal(s.version,10);
  assert.equal((await net.remote.push(JSON.stringify({pid,wins:4}))),true);
  const lastVer=s.version;
  assert(lastVer>10);assert.equal(calls.at(-1).body.expectedVersion,10);
  expected=lastVer+100; // another device updated first
  assert.equal(await net.remote.push(JSON.stringify({pid,wins:5})),false);
  assert.equal(net.remote.syncConflict,true);
  assert.equal(await net.remote.push(JSON.stringify({pid,wins:6})),false); // do not overwrite after conflict
  console.log('email-client: account activation, cloud revision, conflict protection passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

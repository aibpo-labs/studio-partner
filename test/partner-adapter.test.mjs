import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'partner-adapter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'server'));
  await mkdir(path.join(root, '.local'));
  for (const name of ['settings.mjs', 'design-client.mjs', 'partner.mjs', 'voice-contract.mjs'])
    await copyFile(new URL(`../server/${name}`, import.meta.url), path.join(root, 'server', name));
  await writeFile(path.join(root, '.local/settings.json'), JSON.stringify({
    voiceBase: 'https://voice.example.com', voiceKey: 'voice-test-secret', model: 'sample-model',
    designBase: 'https://agent.example.com/api', designToken: 'design-test-secret',
    agentId: 'sample-agent', releaseId: '', extraPrivateField: 'must-not-be-public',
  }));
  return { root, module: name => import(pathToFileURL(path.join(root, 'server', name)).href) };
}

test('public settings use only partner fields and Design requests use the configured service credential', async t => {
  const f = await fixture(t);
  const { publicSettings } = await f.module('settings.mjs');
  const result = await publicSettings();
  assert.deepEqual(Object.keys(result).sort(), [
    'voiceBase', 'model', 'designBase', 'agentId', 'releaseId',
    'voiceKeyConfigured', 'designKeyConfigured', 'designAuthMode',
  ].sort());
  assert.equal(result.designKeyConfigured, true);
  assert.equal(result.designBase, 'https://agent.example.com/api');
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://agent.example.com/api/openapi/studio/v1/agents/sample-agent');
    assert.equal(options.headers.Authorization, 'Bearer design-test-secret');
    return new Response(JSON.stringify({ code: 200, data: { publishedRelease: { id: 'release-1' } } }));
  });
  const { agentBinding } = await f.module('design-client.mjs');
  assert.deepEqual(await agentBinding(), { agentId: 'sample-agent', releaseId: 'release-1' });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('robot listing respects workspace bindings without hiding customer-selected names', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, '.local/partner-robots.json'), JSON.stringify([
    { id: 'local-robot', customId: 'bound-model', type: 'im' },
  ]));
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://voice.example.com/voice/v1/custom-models');
    assert.equal(options.headers.Authorization, 'Bearer voice-test-secret');
    return new Response(JSON.stringify({ data: [
      { id: 'bound-model', config: { name: '测试客服' } },
      { id: 'unbound-model', config: { name: '其他机器人' } },
    ] }));
  });
  const { listRobots } = await f.module('partner.mjs');
  const robots = await listRobots();
  assert.equal(robots.length, 1);
  assert.equal(robots[0].id, 'local-robot');
  assert.equal(robots[0].name, '测试客服');
});


test('stale revisions cannot overwrite drafts and current saves preserve unedited resources', async t => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, '.local/partner-robots.json'), JSON.stringify([{id:'local',customId:'model',type:'voice'}]));
  const config={name:'Original',llm:'latentx-mini',asr:'latentx-asr',tts:'latentx-tts',skills:[],knowledge_refs:[{id:'faq',version:'v1'}],tts_language:'yue-HK'};
  const writes=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    if(url.endsWith('/catalog'))return new Response(JSON.stringify({data:{components:[{id:'latentx-tts',kind:'tts',languages:['yue-HK']}]}}));
    if(options.method==='PUT'){
      const body=JSON.parse(options.body);writes.push(body);
      return new Response(JSON.stringify({data:{id:'model',revision:3,config:body.config,versions:[]}}));
    }
    return new Response(JSON.stringify({data:{id:'model',revision:2,config,versions:[]}}));
  });
  const {saveRobot}=await f.module('partner.mjs');
  await assert.rejects(saveRobot('local',{revision:1,name:'Stale'}),e=>e.statusCode===409);
  assert.equal(writes.length,0);
  const saved=await saveRobot('local',{revision:2,name:'Updated',channel:{greeting:'',idle_timeout_ms:60000}});
  assert.equal(saved.greeting,'');
  assert.equal(saved.idle_timeout_ms,60000);
  assert.deepEqual(writes,[{revision:2,config:{...config,name:'Updated'}}]);
});

test('Realtime conversation pages and event history preserve capture state and cursors', async t => {
  const f = await fixture(t);
  t.mock.method(globalThis,'fetch',async (url) => {
    if (url.includes('/conversations?')) {
      assert.match(url, /origin=realtime/);
      return new Response(JSON.stringify({data:[{call_id:'sess-1',origin:'realtime',model:'sample-model'}],success:true}));
    }
    if (url.endsWith('/conversations/sess-1/events'))
      return new Response(JSON.stringify({data:{capture_state:'complete',items:[{sequence:1,type:'response.done',event_id:'evt-1'}],next_cursor:'cursor-2'},success:true}));
    throw new Error(`unexpected ${url}`);
  });
  const {listCalls,callEvents}=await f.module('partner.mjs');
  const page=await listCalls({limit:10,origin:'realtime'});
  assert.equal(page.items[0].call_id,'sess-1');
  assert.equal(page.items[0].source,'realtime');
  const events=await callEvents('sess-1');
  assert.equal(events.capture_state,'complete');
  assert.equal(events.next_cursor,'cursor-2');
  assert.equal(events.items[0].event_id,'evt-1');
});

test('model binding selects the exact published ID and persists only the local association', async t => {
  const f = await fixture(t);
  const original={id:'local',customId:'old',model:'custom-old-v1',type:'voice',name:'My bot',channel:{greeting:'Hello'},presentation:{greeting:'Welcome'}};
  await writeFile(path.join(f.root,'.local/partner-robots.json'),JSON.stringify([original]));
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.method,'GET');
    assert.equal(url,'https://voice.example.com/voice/v1/custom-models');
    return new Response(JSON.stringify({data:[{id:'new',versions:[
      {model:'custom-new-v2',enabled:true,version:2,config:{instructions:'Version 2'}},
      {model:'custom-new-v3',enabled:true,version:3,config:{instructions:'Version 3'}},
      {model:'custom-new-v1',enabled:false,version:1,config:{}}
    ]}]}));
  });
  const {updateModelBinding,publishedModels,robotForRuntime,createRobot}=await f.module('partner.mjs');
  assert.deepEqual((await publishedModels()).map(x=>x.model),['custom-new-v2','custom-new-v3']);
  const saved=await updateModelBinding('local',{modelId:' custom-new-v2 '});
  assert.equal(saved.published,2);assert.equal(saved.instructions,'Version 2');
  assert.equal(saved.name,'My bot');assert.equal(saved.greeting,'Hello');
  const {readFile}=await import('node:fs/promises');
  const stored=JSON.parse(await readFile(path.join(f.root,'.local/partner-robots.json'),'utf8'));
  assert.deepEqual(stored,[{...original,customId:'new',model:'custom-new-v2'}]);
  for(const id of ['custom-new-v1','missing','new',''])await assert.rejects(updateModelBinding('local',{modelId:id}));
  assert.equal(await readFile(path.join(f.root,'.local/partner-robots.json'),'utf8'),JSON.stringify(stored,null,2));
  const created=await createRobot({name:'Text',type:'im',modelId:'custom-new-v2'});
  assert.equal(created.customId,'new');assert.equal(created.model,'custom-new-v2');assert.equal(created.icon,'chat');
});

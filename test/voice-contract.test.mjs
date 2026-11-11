import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {normalizeSkill, draftConfig, channelConfig, credentialRequest, checkLanguages} from '../server/voice-contract.mjs';
import {attachIM} from '../server/im.mjs';

test('legacy Skill form becomes valid inline Markdown and reference assets remain unchanged', () => {
  const skill=normalizeSkill({id:'support',version:1,name:'订单客服',description:'查询规则',content:'先询问订单号',preload:true,resources:{'references/policy.md':'原文'},required_tools:['lookup_order']});
  assert.deepEqual(Object.keys(skill).sort(),['id','version','preload','markdown','resources','required_tools'].sort());
  assert.match(skill.markdown,/description: "查询规则"/);
  assert.equal(skill.version,'1');
  const ref={id:'support',version:'v2',preload:false,resources:{'r.md':'资料'}};
  assert.deepEqual(normalizeSkill(ref),ref);
  assert.equal(Object.hasOwn(normalizeSkill(ref),'markdown'),false);
});
test('partial draft updates preserve new language and knowledge fields and separate channel settings', () => {
  const current={name:'客服',llm:'latentx-mini',asr:'latentx-asr',tts:'latentx-tts',asr_language:'zh-CN',tts_language:'yue-HK',knowledge_refs:[{id:'faq',version:'v1'}],skills:[{id:'sop',version:'v1',preload:false}],tools:[],customFutureField:'keep'};
  const next=draftConfig(current,{name:'新名称',greeting:'渠道欢迎语',revision:9,channel:{idle_timeout_ms:60000}});
  assert.deepEqual(next,{...current,name:'新名称'});
  assert.deepEqual(draftConfig(next,{knowledge_refs:[]}).knowledge_refs,[]);
  assert.deepEqual(channelConfig({greeting:'',idle_timeout_ms:60000},{greeting:'旧欢迎语'}),{greeting:'',idle_timeout_ms:60000});
  assert.throws(()=>channelConfig({idle_timeout_ms:300}));
  assert.deepEqual(credentialRequest({model:'custom-model-v1',config:{instructions:'不要覆盖',asr_language:'zh-CN'},channel:{greeting:'',idle_timeout_ms:60000}}),
    {model:'custom-model-v1',from:'studio-partner',greeting:'',idle_timeout_ms:60000,allow_mcp_tools:false});
});
test('language choices must belong to their own component, including asymmetric Cantonese support', () => {
  const catalog={components:[{kind:'asr',id:'asr',languages:['auto','zh-CN']},{kind:'tts',id:'tts',languages:['yue-HK']}]};
  assert.doesNotThrow(()=>checkLanguages({asr:'asr',tts:'tts',asr_language:'zh-CN',tts_language:'yue-HK'},catalog));
  assert.throws(()=>checkLanguages({asr:'asr',asr_language:'yue-HK'},catalog));
  assert.doesNotThrow(()=>checkLanguages({asr:'asr',tts:'tts',asr_language:'',tts_language:''},catalog));
});
test('IM inherits a published model without clearing prompt, Skill or knowledge search', () => {
  class Socket extends EventEmitter {readyState=1;sent=[];send(v){this.sent.push(JSON.parse(v));}close(){this.readyState=3;}}
  const client=new Socket(),remote=new Socket();
  attachIM(client,{voiceBase:'https://voice.example.com',voiceKey:'test-secret',model:'custom-model-v1',published:true},()=>remote);
  remote.emit('message',Buffer.from(JSON.stringify({type:'session.created'})));
  assert.deepEqual(remote.sent[0],{type:'session.update',session:{type:'realtime',output_modalities:['text']}});
  remote.emit('message',Buffer.from(JSON.stringify({type:'session.updated'})));
  assert.equal(client.sent[0].type,'ready');
  client.emit('close');
});

test('pinned robots never follow a newer version or silently fall back when disabled', async () => {
  const {publicRobot,selectedVersion}=await import('../server/partner.mjs');
  const original={id:'service',revision:10,config:{name:'New draft'},versions:[
    {version:8,model:'custom-service-v8',enabled:true,config:{name:'v8',instructions:'Version eight'}},
    {version:9,model:'custom-service-v9',enabled:true,config:{name:'v9',instructions:'Version nine'}},
  ]};
  const binding={id:'local-poc',type:'im',name:'POC 文本',model:'custom-service-v8'};
  const view=publicRobot(original,binding);
  assert.equal(view.name,'POC 文本');assert.equal(view.published,8);assert.equal(view.instructions,'Version eight');
  assert.equal(view.readOnly,true);assert.equal(view.draft,false);
  original.versions[0].enabled=false;
  assert.equal(selectedVersion(original,binding),undefined);
  assert.equal(publicRobot(original,binding).versionUnavailable,true);
  assert.equal(publicRobot(original,binding).published,null);
});

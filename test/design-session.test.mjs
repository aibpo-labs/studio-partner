import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const source=await readFile(new URL('../examples/workbench/app.js',import.meta.url),'utf8');
function fixture(saved){
 const requests=[],streams=[],storage=new Map(saved?[['studio-partner-design:robot','missing-session']]:[]);
 const context=vm.createContext({Map,uid:()=>`temporary-${Math.random()}`,now:()=>'',render:()=>{},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},EventSource:class{constructor(url){streams.push(url);}},api:async(path,options)=>{requests.push(path);if(path.endsWith('missing-session'))throw Error('missing');return{id:'server-session',remoteId:'platform-session',messages:[],files:[]};}});
 vm.runInContext(source.slice(source.indexOf('const designByRobot ='),source.indexOf('function fileSize(')),context);
 return{context,requests,streams,storage};
}
test('created session uses server identity for selection, persistence and event subscription',async()=>{
 const f=fixture();await vm.runInContext('ensureDesignSession({id:"robot"})',f.context);
 assert.equal(vm.runInContext('designSession({id:"robot"}).id',f.context),'server-session');
 assert.equal(vm.runInContext('designStore({id:"robot"}).current',f.context),'server-session');
 assert.equal(f.storage.get('studio-partner-design:robot'),'server-session');
 assert.deepEqual(f.streams,['/api/design/sessions/server-session/events']);
});
test('missing saved session creates a usable replacement instead of remaining loading',async()=>{
 const f=fixture(true);await vm.runInContext('restoreDesignSession({id:"robot"})',f.context);
 assert.deepEqual(f.requests,['/api/design/sessions/missing-session','/api/design/sessions']);
 assert.equal(vm.runInContext('designSession({id:"robot"}).remoteId',f.context),'platform-session');
 assert.equal(vm.runInContext('designStore({id:"robot"}).loading',f.context),false);
});

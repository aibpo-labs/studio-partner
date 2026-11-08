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
  for (const name of ['settings.mjs', 'design-client.mjs', 'partner.mjs'])
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
    assert.equal(url, 'https://voice.example.com/voice/v1/custom-models?limit=100');
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

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { httpError, draftConfig, checkLanguages, channelConfig, skillView, resourceRef } from "./voice-contract.mjs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { settings, dataDir } from "./settings.mjs";

const registryPath = fileURLToPath(new URL("partner-robots.json", dataDir));
let robots;
try { robots = JSON.parse(await readFile(registryPath, "utf8")); }
catch (e) { if (e.code !== "ENOENT") throw e; robots = []; }

async function persist() {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temp = `${registryPath}.next`;
  await writeFile(temp, JSON.stringify(robots, null, 2), { mode: 0o600 });
  await rename(temp, registryPath);
}
async function request(path, { method = "GET", body } = {}) {
  const s = await settings();
  if (!s.voiceKey) throw new Error("请先配置 Voice PaaS Key");
  const r = await fetch(s.voiceBase + path, {
    method,
    headers: { Authorization: `Bearer ${s.voiceKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const message = r.status === 401 ? 'Voice PaaS Key 无效或已失效，请在连接配置更新' :
      r.status === 409 ? '配置或资源版本冲突，请刷新后重试；资源内容变更需使用新版本号' :
      `Voice PaaS 请求失败（HTTP ${r.status}）：${j.message || j.error?.message || "请检查权限或配置"}`;
    const error = httpError(message, r.status >= 400 ? r.status : 502);
    error.requestId = r.headers.get('x-request-id') || undefined;
    throw error;
  }
  return j.data ?? j;
}
export function selectedVersion(robot, binding = {}) {
  const versions = (robot.versions || []).filter(v => v.enabled);
  return binding.model ? versions.find(v => v.model === binding.model) : [...versions].sort((a,b) => b.version-a.version)[0];
}
export function robotPresentation(id) {
  const entry = robots.find(x => x.id === id);
  if (!entry) throw httpError('未找到此工作区中的机器人', 404);
  return { name: entry.name, presentation: entry.presentation || null };
}
export function publicRobot(robot, binding = {}) {
  const published = selectedVersion(robot, binding);
  const config = binding.model ? (published?.config || {}) : (robot.config || {});
  return {
    id: binding.id || robot.id, type: (binding.type || robot.type) === "im" ? "文本机器人" : "语音机器人",
    icon: (binding.type || robot.type) === "im" ? "chat" : "voice", name: binding.name || config.name || robot.name,
    desc: config.description || "", model: binding.model || published?.model || config.llm || "latentx-realtime-2.5-mini",
    readOnly: !!binding.model, versionUnavailable: !!binding.model && !published,
    published: published?.version || null, skills: (config.skills || []).map(skillView),
    knowledge_refs: config.knowledge_refs || [], draft: !binding.model && (!published || !isDeepStrictEqual(draftConfig(config, {}), draftConfig(published.config || {}, {}))),
    validated: false, greeting: binding.channel?.greeting ?? "你好，我可以为你提供帮助。",
    idle_timeout_ms: binding.channel?.idle_timeout_ms ?? 10000, channel: binding.channel || {},
    instructions: config.instructions || "", voice: config.voice || "female-default",
    silence: `${config.silence_duration_ms ?? 300} ms`, customId: binding.customId || robot.id,
    revision: robot.revision || 0, config,
  };
}
export async function listRobots() {
  const models = await request("/voice/v1/custom-models");
  const byId = new Map(models.map(x => [x.id, x]));
  return robots
    .map(binding => {
      const model = byId.get(binding.customId);
      return model ? publicRobot(model, binding) : null;
    })
    .filter(Boolean);
}
export async function publishedModels() {
  const models = await request('/voice/v1/custom-models');
  return models.flatMap(m => (m.versions || []).filter(v => v.enabled).map(v => ({
    model: v.model, name: v.config?.name || m.config?.name || m.id, version: v.version,
  })));
}
async function resolvePublishedModel(modelId) {
  if (typeof modelId !== 'string' || !/^[A-Za-z0-9_.-]{1,150}$/.test(modelId.trim()))
    throw httpError('请填写有效的已发布模型 ID', 400);
  const requested = modelId.trim();
  const models = await request('/voice/v1/custom-models');
  for (const model of models) {
    const active = (model.versions || []).find(v => v.model === requested && v.enabled);
    if (active) return { model, active };
  }
  throw httpError('该模型 ID 不存在、未发布或已停用，请选择当前账户可用的已发布模型', 409);
}
export async function updateModelBinding(id, input) {
  const index = robots.findIndex(x => x.id === id);
  if (index < 0) throw httpError('未找到此工作区中的机器人', 404);
  if (!robots[index].model) throw httpError('此机器人使用配置草稿，不支持切换外部模型绑定', 409);
  const { model, active } = await resolvePublishedModel(input.modelId);
  const previous = robots[index];
  const entry = { ...previous, customId: model.id, model: active.model };
  robots[index] = entry;
  try { await persist(); } catch (error) { robots[index] = previous; throw error; }
  return publicRobot(model, entry);
}
export async function createRobot(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  if (!name) throw new Error("请输入机器人名称");
  const id = `partner-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const type = input.type === "im" ? "im" : "voice";
  const requestedModelId = String(input.modelId || "").trim();
  if (requestedModelId) {
    const { model, active } = await resolvePublishedModel(requestedModelId);
    const entry = { id, customId: model.id, model: active.model, type, name };
    robots.push(entry); await persist();
    return publicRobot(model, entry);
  }
  const config = {
    name, llm: "latentx-mini", asr: "latentx-asr", tts: "latentx-tts",
    voice: "female-default", instructions: "你是友好、专业的中文客服。根据已提供的业务资料回答，不确定时说明需要人工核实。",
    temperature: 0.2, max_tokens: 1024, silence_duration_ms: 300,
    skills: [], knowledge_refs: [], mcp_refs: [], tools: [],
  };
  await request(`/voice/v1/custom-models/${encodeURIComponent(id)}`, { method: "PUT", body: { revision: 0, config } });
  const entry = { id, customId: id, type, channel: { greeting: "你好，我可以为你提供帮助。", idle_timeout_ms: 10000 } };
  robots.push(entry); await persist();
  const models = await request("/voice/v1/custom-models");
  return publicRobot(models.find(x => x.id === id) || { id, config, revision: 1, versions: [] }, entry);
}
export async function saveRobot(id, input) {
  const entry = robots.find(x => x.id === id);
  if (!entry) throw new Error("未找到此工作区中的机器人");
  if (entry.model) throw httpError("此机器人绑定固定发布版本，不能修改共享模型", 409);
  const current = (await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`));
  if (input.revision !== undefined && input.revision !== current.revision)
    throw httpError('配置已被更新，请刷新机器人后再保存，当前编辑尚未覆盖云端', 409);
  const channel = channelConfig(input.channel, entry.channel);
  const config = draftConfig(current.config, input);
  if (config.asr_language || config.tts_language) checkLanguages(config, await catalog());
  const saved = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`, { method: "PUT", body: { revision: current.revision, config } });
  entry.channel = channel; await persist();
  return publicRobot(saved, entry);
}
export async function validateRobot(id, input = {}) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  if (entry.model) throw httpError("此机器人绑定固定发布版本，不支持草稿发布操作", 409);
  const current = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  if (input.revision !== undefined && input.revision !== current.revision) throw httpError('配置已变化，请刷新后校验', 409);
  const result = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}/validate`, { method: "POST", body: { revision: current.revision } });
  if (result.valid === false) throw httpError('配置校验未通过：' + JSON.stringify(result.errors || result.message || '请检查资源及配置'));
  return result;
}
export async function publishRobot(id, input = {}) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  if (entry.model) throw httpError("此机器人绑定固定发布版本，不支持草稿发布操作", 409);
  const current = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  if (input.revision !== undefined && input.revision !== current.revision) throw httpError('配置已变化，请刷新后发布', 409);
  return request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}/publish`, { method: "POST", body: { revision: current.revision } });
}
export async function deleteRobot(id) {
  const index = robots.findIndex(x => x.id === id); if (index < 0) throw new Error("未找到机器人");
  if (!robots[index].model) await request(`/voice/v1/custom-models/${encodeURIComponent(robots[index].customId)}`, { method: "DELETE" });
  robots.splice(index, 1); await persist(); return { ok: true };
}
function pageResult(value) {
  if (Array.isArray(value)) return { items: value, next_cursor: "" };
  if (value && typeof value === "object") {
    const items = Array.isArray(value.items) ? value.items :
      Array.isArray(value.conversations) ? value.conversations :
      Array.isArray(value.data) ? value.data : [];
    return { ...value, items, next_cursor: value.next_cursor || value.nextCursor || "" };
  }
  return { items: [], next_cursor: "" };
}
export async function listCalls(query = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(500, Math.max(1, Number(query.limit) || 100))) });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  // The PaaS list endpoint is tenant-wide by default. Keep both Realtime IM sessions
  // and WebRTC voice calls visible; callers can pass origin=realtime or origin=web
  // when they need a narrower view.
  if (query.origin && query.origin !== "all") params.set("origin", query.origin);
  if (query.cursor) params.set("cursor", query.cursor);
  const page = pageResult(await request(`/voice/v1/conversations?${params}`));
  return {
    ...page,
    items: page.items.map(c => ({ ...c, type: "voice", source: c.origin || "realtime" })),
  };
}
export async function callDetail(id) { return request(`/voice/v1/conversations/${encodeURIComponent(id)}`); }
export async function callEvents(id, query = {}) {
  const params = new URLSearchParams();
  if (query.limit) params.set("limit", String(Math.min(500, Math.max(1, Number(query.limit) || 100))));
  if (query.cursor) params.set("cursor", query.cursor);
  const suffix = params.toString() ? `?${params}` : "";
  return pageResult(await request(`/voice/v1/conversations/${encodeURIComponent(id)}/events${suffix}`));
}
export async function catalog() { return request("/voice/v1/catalog"); }
export async function listKnowledge() { return request('/voice/v1/knowledge'); }
export async function readSkill(id, version) {
  const ref = resourceRef({id, version});
  return request(`/voice/v1/skills/${encodeURIComponent(ref.id)}/versions/${encodeURIComponent(ref.version)}`);
}
export async function createKnowledge(input) {
  const ref = resourceRef(input);
  if (typeof input.markdown !== 'string' || !input.markdown.trim()) throw httpError('请填写知识正文');
  return request(`/voice/v1/knowledge/${encodeURIComponent(ref.id)}/versions/${encodeURIComponent(ref.version)}`,
    {method:'PUT', body:{markdown:input.markdown, resources:input.resources || {}}});
}
export async function robotForRuntime(id) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  const model = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  const active = selectedVersion(model, entry);
  if (!active) throw httpError(entry.model ? "绑定的发布版本已停用或不存在，请重新选择模型" : "机器人尚未发布配置");
  if ((active.config?.tools || []).length) throw httpError('此机器人包含 Function 工具，本工作台尚未接入工具执行，请先移除或实现执行器');
  if ((active.config?.mcp_refs || []).length) throw httpError('此机器人配置了外部工具，本工作台尚未开放执行授权');
  return { model: active.model, config: active.config || {}, channel: entry.channel || {} };
}

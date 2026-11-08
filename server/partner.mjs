import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
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
  if (!r.ok || j.success === false) throw new Error(`Voice PaaS 请求失败（HTTP ${r.status}）：${j.message || "请检查权限或配置"}`);
  return j.data ?? j;
}
export function publicRobot(robot, binding = {}) {
  const published = [...(robot.versions || [])].filter(v => v.enabled).sort((a,b) => b.version-a.version)[0];
  const config = robot.config || {};
  return {
    id: binding.id || robot.id, type: (binding.type || robot.type) === "im" ? "文本机器人" : "语音机器人",
    icon: (binding.type || robot.type) === "im" ? "chat" : "voice", name: config.name || robot.name,
    desc: config.description || "", model: published?.model || config.llm || "latentx-realtime-2.5-mini",
    published: published?.version || null, skills: config.skills || [], draft: robot.revision > 0,
    validated: false, greeting: config.greeting || "你好，我可以为你提供帮助。",
    instructions: config.instructions || "", voice: config.voice || "female-default",
    silence: `${config.silence_duration_ms ?? 300} ms`, customId: binding.customId || robot.id,
    revision: robot.revision || 0, config,
  };
}
export async function listRobots() {
  const models = await request("/voice/v1/custom-models?limit=100");
  const byId = new Map(models.map(x => [x.id, x]));
  return robots
    .map(binding => {
      const model = byId.get(binding.customId);
      return model ? publicRobot(model, binding) : null;
    })
    .filter(Boolean);
}
export async function createRobot(input) {
  const name = String(input.name || "").trim().slice(0, 100);
  if (!name) throw new Error("请输入机器人名称");
  const id = `partner-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const type = input.type === "im" ? "im" : "voice";
  const config = {
    name, llm: "latentx-mini", asr: "latentx-asr", tts: "latentx-tts",
    voice: "female-default", instructions: "你是友好、专业的中文客服。根据已提供的业务资料回答，不确定时说明需要人工核实。",
    temperature: 0.2, max_tokens: 1024, silence_duration_ms: 300,
    skills: [], mcp_refs: [], tools: [],
  };
  await request(`/voice/v1/custom-models/${encodeURIComponent(id)}`, { method: "PUT", body: { revision: 0, config } });
  const entry = { id, customId: id, type };
  robots.push(entry); await persist();
  const models = await request("/voice/v1/custom-models?limit=100");
  return publicRobot(models.find(x => x.id === id) || { id, config, revision: 1, versions: [] }, entry);
}
export async function saveRobot(id, input) {
  const entry = robots.find(x => x.id === id);
  if (!entry) throw new Error("未找到此工作区中的机器人");
  const current = (await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`));
  const config = { ...current.config, ...input };
  const saved = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`, { method: "PUT", body: { revision: current.revision, config } });
  return publicRobot(saved, entry);
}
export async function validateRobot(id) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  const current = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  return request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}/validate`, { method: "POST", body: { revision: current.revision } });
}
export async function publishRobot(id) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  const current = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  return request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}/publish`, { method: "POST", body: { revision: current.revision } });
}
export async function deleteRobot(id) {
  const index = robots.findIndex(x => x.id === id); if (index < 0) throw new Error("未找到机器人");
  await request(`/voice/v1/custom-models/${encodeURIComponent(robots[index].customId)}`, { method: "DELETE" });
  robots.splice(index, 1); await persist(); return { ok: true };
}
export async function listCalls(query = {}) {
  const params = new URLSearchParams({ limit: String(Math.min(500, Math.max(1, Number(query.limit) || 100))) });
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  const calls = await request(`/voice/v1/conversations?${params}`);
  return calls.map(c => ({ ...c, type: "voice" }));
}
export async function callDetail(id) { return request(`/voice/v1/conversations/${encodeURIComponent(id)}`); }
export async function catalog() { return request("/voice/v1/catalog"); }
export async function robotForRuntime(id) {
  const entry = robots.find(x => x.id === id); if (!entry) throw new Error("未找到机器人");
  const model = await request(`/voice/v1/custom-models/${encodeURIComponent(entry.customId)}`);
  const active = [...(model.versions || [])].filter(v => v.enabled).sort((a,b) => b.version-a.version)[0];
  if (!active) throw new Error("机器人尚未发布配置");
  return { model: active.model, config: active.config || model.config };
}

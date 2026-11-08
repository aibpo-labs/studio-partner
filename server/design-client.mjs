import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { settings } from "./settings.mjs";
export const localDir = fileURLToPath(new URL("../.local/", import.meta.url));
const authPath = `${localDir}/design-auth.json`;
let auth, refreshing;
export async function saveAuth(value) {
  auth = value;
  await mkdir(localDir, { recursive: true, mode: 0o700 });
  await writeFile(authPath, JSON.stringify(value), { mode: 0o600 });
}
async function token() {
  const config = await settings();
  if (config.designToken) return config.designToken;
  if (!auth) {
    try { auth = JSON.parse(await readFile(authPath, "utf8")); }
    catch (e) { if (e.code === "ENOENT") throw new Error("请先在连接配置中填写 Design Agent Key / Token"); throw e; }
  }
  if (!auth.baseURL || auth.baseURL !== config.designBase)
    throw new Error("新 Design Agent 地址需要配置对应的 Key");
  return auth.accessToken;
}
async function refresh() {
  if (!refreshing)
    refreshing = (async () => {
      if (!auth?.refreshToken)
        throw new Error("Design Agent 登录已过期，请更新连接凭证");
      const config = await settings();
      const r = await fetch(config.designBase + "/auth/refresh-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: auth.refreshToken }),
        signal: AbortSignal.timeout(15000),
      });
      const j = await r.json();
      if (!r.ok || !j.data?.accessToken)
        throw new Error("Design Agent 登录已过期，请更新连接凭证");
      await saveAuth({ ...j.data, baseURL: config.designBase });
    })().finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}
export async function designRequest(
  path,
  {
    method = "GET",
    body,
    headers = {},
    signal,
    raw = false,
    binary = false,
    retry = true,
  } = {},
) {
  const config = await settings();
  if (!config.designBase) throw new Error("请先在连接配置中填写 Design Agent 服务地址");
  const r = await fetch(config.designBase + path, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(body !== undefined ? { "Content-Type": binary ? "application/octet-stream" : "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : binary ? body : JSON.stringify(body),
    signal: signal || AbortSignal.timeout(30000),
  });
  if (r.status === 401 && retry && !config.designToken) {
    await refresh();
    return designRequest(path, { method, body, headers, signal, raw, binary, retry: false });
  }
  if (!r.ok) throw new Error(`Design Agent 请求失败（HTTP ${r.status}）`);
  if (raw) return r;
  const text = await r.text();
  if (!text) return null;
  const j = JSON.parse(text);
  if (
    j.success === false ||
    (j.code !== undefined && ![200, "200", 1000, "1000"].includes(j.code))
  ) {
    if ([401, "401"].includes(j.code) && retry && !config.designToken) {
      await refresh();
      return designRequest(path, { method, body, headers, signal, raw, binary, retry: false });
    }
    throw new Error(`Design Agent 操作失败（${j.code || "UNKNOWN"}）`);
  }
  return Object.hasOwn(j, "data") && Object.hasOwn(j, "code") ? j.data : j;
}
export async function agentBinding() {
  const s = await settings();
  if (!s.agentId) throw new Error("请先配置 Design Agent ID");
  if (s.releaseId) return { agentId: s.agentId, releaseId: s.releaseId };
  const agent = await designRequest(`/openapi/studio/v1/agents/${s.agentId}`);
  if (!agent.publishedRelease?.id) throw new Error("Design Agent 尚未发布");
  return { agentId: s.agentId, releaseId: agent.publishedRelease.id };
}

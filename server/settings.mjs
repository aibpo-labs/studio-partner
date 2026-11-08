import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
export const dataDir = new URL("../.local/", import.meta.url);
let overrides;
export async function settings() {
  if (!overrides) {
    try {
      overrides = JSON.parse(
        await readFile(new URL("settings.json", dataDir), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      overrides = {};
    }
  }
  let binding = {};
  try {
    binding = JSON.parse(
      await readFile(new URL("design-agent.json", dataDir), "utf8"),
    );
  } catch {}
  return {
    voiceBase: process.env.LATENTX_API_BASE || "https://api.latenth.com",
    voiceKey: process.env.LATENTX_API_KEY || "",
    model: process.env.LATENTX_MODEL || "latentx-realtime-2.5-mini",
    designBase: process.env.DESIGN_AGENT_BASE_URL || "",
    designToken: process.env.DESIGN_AGENT_TOKEN || "",
    agentId: process.env.DESIGN_AGENT_ID || binding.agentId || "",
    releaseId: process.env.DESIGN_AGENT_RELEASE_ID || binding.releaseId || "",
    ...overrides,
  };
}
export async function publicSettings() {
  const s = await settings();
  let localAuth = false;
  try {
    const a = JSON.parse(
      await readFile(new URL("design-auth.json", dataDir), "utf8"),
    );
    localAuth =
      !!a.accessToken &&
      !!a.baseURL && a.baseURL === s.designBase;
  } catch {}
  return {
    voiceBase: s.voiceBase,
    model: s.model,
    designBase: s.designBase,
    agentId: s.agentId,
    releaseId: s.releaseId,
    voiceKeyConfigured: !!s.voiceKey,
    designKeyConfigured: !!s.designToken || localAuth,
    designAuthMode: s.designToken ? "token" : localAuth ? "refreshable" : "missing",
  };
}
export function validateSettings(input, current) {
  const next = { ...current };
  for (const k of ["voiceBase", "model", "designBase", "agentId", "releaseId"])
    if (Object.hasOwn(input, k)) {
      if (typeof input[k] !== "string") throw new Error("配置字段必须是文本");
      next[k] = input[k].trim();
    }
  for (const k of ["voiceBase", "designBase"]) {
    // Voice can be configured independently before a Design platform is bound.
    if (k === "designBase" && !next[k]) continue;
    const u = new URL(next[k]);
    if (
      !["http:", "https:"].includes(u.protocol) ||
      u.username ||
      u.password ||
      u.search ||
      u.hash
    )
      throw new Error("服务地址必须是 HTTP(S) 基址，不包含凭证、查询或片段");
    next[k] = next[k].replace(/\/+$/, "");
  }
  if (!next.model || next.model.length > 150)
    throw new Error("请填写有效模型 ID");
  for (const k of ["agentId", "releaseId"])
    if (next[k] && !/^[A-Za-z0-9_.-]{1,128}$/.test(next[k]))
      throw new Error("Agent / Release ID 格式无效");
  for (const [baseKey, secretKey] of [["voiceBase", "voiceKey"], ["designBase", "designToken"]]) {
    if (next[baseKey] !== current[baseKey] && current[secretKey] &&
        (typeof input[secretKey] !== "string" || !input[secretKey].trim()))
      throw new Error("更换服务地址时，请同时填写对应服务的新 Key / Token");
  }
  for (const k of ["voiceKey", "designToken"])
    if (input[k]) {
      if (
        typeof input[k] !== "string" ||
        input[k].length > 16000 ||
        /[\r\n]/.test(input[k])
      )
        throw new Error("Key 格式无效");
      next[k] = input[k].trim().replace(/^Bearer\s+/i, "");
    }
  return next;
}
export async function updateSettings(input) {
  const next = validateSettings(input, await settings());
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const temp = new URL("settings.next.json", dataDir),
    target = new URL("settings.json", dataDir);
  await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 });
  await rename(temp, target);
  overrides = next;
  return publicSettings();
}

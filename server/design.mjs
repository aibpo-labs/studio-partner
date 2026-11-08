import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { designRequest, agentBinding } from "./design-client.mjs";
import { dataDir } from "./settings.mjs";
const sessions = new Map();
const listeners = new Map();
let saving = Promise.resolve();
try {
  for (const s of JSON.parse(
    await readFile(new URL("sessions.json", dataDir), "utf8"),
  )) {
    if (s.busy) {
      s.busy = false;
      s.error = "本地服务已重启，上一轮状态请检查后重新发起";
    }
    sessions.set(s.id, s);
  }
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
function persist() {
  saving = saving
    .catch(() => {})
    .then(async () => {
      await mkdir(dataDir, { recursive: true, mode: 0o700 });
      const tmp = new URL("sessions.next.json", dataDir);
      await writeFile(tmp, JSON.stringify([...sessions.values()]), {
        mode: 0o600,
      });
      await rename(tmp, new URL("sessions.json", dataDir));
    });
  return saving;
}
export const activeDesign = () => [...sessions.values()].some((s) => s.busy);
export const getSession = (id) => {
  const s = sessions.get(id);
  if (!s) throw new Error("Design 会话不存在");
  return s;
};
const emit = (s) => {
  for (const res of listeners.get(s.id) || [])
    res.write(`data: ${JSON.stringify(s)}\n\n`);
};
export function subscribe(id, res) {
  const s = getSession(id);
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
  });
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id).add(res);
  res.write(`data: ${JSON.stringify(s)}\n\n`);
  const heart = setInterval(() => res.write(": heartbeat\n\n"), 15000);
  res.on("close", () => {
    clearInterval(heart);
    listeners.get(id)?.delete(res);
  });
}
export async function createDesign() {
  if (sessions.size >= 100)
    throw new Error("本地会话已达100个，请备份后清理本地历史");
  const binding = await agentBinding();
  const remote = await designRequest("/v1/runtime/sessions", {
    method: "POST",
    body: binding,
  });
  if (!remote.sessionId) throw new Error("Design Agent 未返回 Session ID");
  const s = {
    id: randomUUID(),
    remoteId: remote.sessionId,
    agentId: binding.agentId,
    releaseId: binding.releaseId,
    messages: [],
    files: [],
    busy: false,
    status: "ready",
  };
  sessions.set(s.id, s);
  await persist();
  return s;
}
export async function startDesign(id, text) {
  const s = getSession(id);
  if (s.busy) throw new Error("Design 正在运行");
  if (typeof text !== "string" || !text.trim() || text.length > 12000)
    throw new Error("消息长度为 1–12000 字");
  s.busy = true;
  s.error = "";
  s.interaction = null;
  s.status = "Design 启动中";
  s.messages.push(
    { role: "user", text, id: randomUUID() },
    { role: "assistant", text: "", id: randomUUID() },
  );
  emit(s);
  try {
    const run = await designRequest(`/v1/runtime/sessions/${s.remoteId}/runs`, {
      method: "POST",
      body: { text, idempotencyKey: randomUUID(), timeoutMillis: 180000 },
    });
    s.runId = run.runId;
    if (!s.runId) throw new Error("Design Agent 未返回 Run ID");
    s.status = "Design 运行中";
    await persist();
    emit(s);
    void consume(s);
    return s;
  } catch (e) {
    s.busy = false;
    s.status = "启动失败";
    s.error = e.message;
    await persist();
    emit(s);
    throw e;
  }
}
export async function cancelDesign(id) {
  const s = getSession(id);
  if (s.busy && s.runId) {
    await designRequest(`/v1/runtime/runs/${s.runId}/cancel`, { method: "POST" });
    s.status = "正在停止";
    emit(s);
  }
  return s;
}
export async function interact(id, decision) {
  const s = getSession(id);
  if (!s.busy || !s.interaction?.interactionId)
    throw new Error("没有等待处理的审批");
  if (!["accept", "decline"].includes(decision)) throw new Error("无效决定");
  await designRequest(
    `/v1/runtime/runs/${s.runId}/interactions/${s.interaction.interactionId}`,
    { method: "POST", body: { decision, scope: "turn" } },
  );
  s.interaction = null;
  s.status = "Design 运行中";
  emit(s);
  return s;
}
export async function fileContent(id, path) {
  const s = getSession(id);
  const file = s.files.find((f) => f.path === path);
  if (!file) throw new Error("文件不存在");
  if (file.kind === "input") {
    const r = await designRequest(
      `/v1/runtime/sessions/${s.remoteId}/workspace/file?path=${encodeURIComponent(path)}`,
      { raw: true },
    );
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 10 * 1024 * 1024) throw new Error("文件过大");
    return bytes;
  }
  if (!s.snapshotId)
    throw new Error("文件不存在");
  const r = await designRequest(
    `/v1/runtime/sessions/${s.remoteId}/workspace/snapshots/${s.snapshotId}/file?path=${encodeURIComponent(path)}`,
    { raw: true },
  );
  const content = await r.text();
  if (Buffer.byteLength(content) > 2 ** 20) throw new Error("文件过大");
  return content;
}
export async function uploadInput(id, name, bytes, type = "application/octet-stream") {
  const s = getSession(id);
  if (s.busy) throw new Error("Design 运行中，暂不能上传文件");
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 10 * 1024 * 1024)
    throw new Error("文件大小必须在 1 B 到 10 MB 之间");
  const original = String(name || "附件").split(/[\\/]/).pop().slice(0, 180) || "附件";
  const ext = original.match(/\.[A-Za-z0-9]{1,12}$/)?.[0]?.toLowerCase() || "";
  const path = `uploads/${randomUUID()}${ext}`;
  await designRequest(
    `/v1/runtime/sessions/${encodeURIComponent(s.remoteId)}/workspace/input?path=${encodeURIComponent(path)}`,
    { method: "PUT", body: bytes, binary: true, raw: true },
  );
  const file = { id: randomUUID(), path, name: original, kind: "input", size: bytes.length, type: String(type).slice(0, 100) };
  s.files = [...s.files.filter((f) => f.path !== path), file];
  await persist();
  emit(s);
  return file;
}
async function finish(s, status) {
  s.busy = false;
  s.interaction = null;
  s.status =
    status === "COMPLETED"
      ? "已完成"
      : status === "CANCELLED"
        ? "已停止"
        : "运行失败";
  if (status === "COMPLETED") {
    try {
      const snap = await designRequest(
        `/v1/runtime/sessions/${s.remoteId}/workspace/snapshots`,
        { method: "POST" },
      );
      s.snapshotId = snap.snapshotId;
      const inputFiles = s.files.filter((f) => f.kind === "input");
      const outputFiles = (snap.artifacts || []).filter(
        (f) => /\.(json|md|txt)$/i.test(f.path) && Number(f.size) <= 2 ** 20,
      ).map((f) => ({ ...f, kind: "output" }));
      s.files = [...inputFiles, ...outputFiles];
    } catch (e) {
      s.error = "对话已完成，但文件归档失败：" + e.message;
    }
  }
  await persist();
  emit(s);
}
export function projectEvent(s, e) {
  const d = e.data || {},
    message = s.messages.at(-1);
  if (e.type === "text.delta" && typeof d.delta === "string")
    message.text += d.delta;
  if (e.type === "item.completed") {
    const i = d.item || {};
    if (
      ["agentMessage", "agent_message"].includes(i.type) &&
      i.text &&
      !message.text
    )
      message.text = i.text;
    if (["commandExecution", "command_execution"].includes(i.type))
      s.status = "正在整理配置文件";
  }
  if (e.type === "interaction.requested") {
    s.interaction = { ...d, interactionId: d.interactionId || d.id };
    s.status = "等待操作确认";
  }
  if (["interaction.resolved", "interaction.cleared"].includes(e.type)) {
    s.interaction = null;
    s.status = "Design 运行中";
  }
  if (e.type === "usage.updated") s.usage = d.usage;
  if (e.type === "run.failed") s.error = d.errorCode || "Design 执行失败";
  return {
    "run.completed": "COMPLETED",
    "run.failed": "FAILED",
    "run.cancelled": "CANCELLED",
  }[e.type];
}
async function consume(s) {
  let sequence = 0;
  const deadline = Date.now() + 210000;
  try {
    while (Date.now() < deadline) {
      const r = await designRequest(`/v1/runtime/runs/${s.runId}/events`, {
        raw: true,
        headers: {
          Accept: "text/event-stream",
          "Last-Event-ID": String(sequence),
        },
        signal: AbortSignal.timeout(Math.max(1000, deadline - Date.now())),
      });
      const reader = r.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += done
            ? decoder.decode()
            : decoder.decode(value, { stream: true });
          const frames = buffer.split(/\r?\n\r?\n/);
          buffer = frames.pop() || "";
          if (done && buffer.trim()) frames.push(buffer);
          for (const frame of frames) {
            const data = frame
              .split(/\r?\n/)
              .filter((l) => l.startsWith("data:"))
              .map((l) => l.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const e = JSON.parse(data);
            if (Number(e.sequence) <= sequence) continue;
            sequence = Number(e.sequence);
            const terminal = projectEvent(s, e);
            emit(s);
            if (terminal) {
              await finish(s, terminal);
              return;
            }
          }
          if (done) break;
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const run = await designRequest(`/v1/runtime/runs/${s.runId}`);
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(run.status)) {
        if (run.text && !s.messages.at(-1).text)
          s.messages.at(-1).text = run.text;
        await finish(s, run.status);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error("Design 超时");
  } catch (e) {
    await designRequest(`/v1/runtime/runs/${s.runId}/cancel`, { method: "POST" }).catch(
      () => {},
    );
    s.error = e.message;
    await finish(s, "FAILED");
  }
}

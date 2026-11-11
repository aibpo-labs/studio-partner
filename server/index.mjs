import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { settings, publicSettings, updateSettings } from "./settings.mjs";
import { attachIM } from "./im.mjs";
import { designRequest, agentBinding } from "./design-client.mjs";
import * as design from "./design.mjs";
import * as partner from "./partner.mjs";
import { credentialRequest } from "./voice-contract.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
const workbench = path.resolve(fileURLToPath(new URL("../examples/workbench/", import.meta.url)));
const port = Number(process.env.PORT || 18227),
  ws = new WebSocketServer({ noServer: true, maxPayload: 24000 });
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(req) {
  let raw = "";
  for await (const c of req) {
    raw += c;
    if (Buffer.byteLength(raw) > 512 * 1024) throw new Error("请求过大");
  }
  return JSON.parse(raw || "{}");
}
async function binaryBody(req, maxBytes = 10 * 1024 * 1024) {
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("文件不能超过 10 MB");
    parts.push(chunk);
  }
  return Buffer.concat(parts, size);
}
function trusted(req) {
  const host = req.headers.host;
  return (
    ["127.0.0.1", "localhost"].some((h) => host === `${h}:${port}`) &&
    (!req.headers.origin || req.headers.origin === `http://${host}`)
  );
}
async function voiceRequest(endpoint, options = {}) {
  const s = await settings();
  if (!s.voiceKey) throw new Error("请先在连接配置中填写 Voice PaaS Key");
  const r = await fetch(s.voiceBase + endpoint, {
    ...options,
    headers: {
      Authorization: `Bearer ${s.voiceKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false)
    throw new Error(
      `Voice PaaS 请求失败（HTTP ${r.status}），请检查 Key、模型权限和额度`,
    );
  return j.data ?? j;
}
let credentialAt = 0;
const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' wss: ws:; media-src 'self' blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-src 'self'; frame-ancestors 'self'",
  );
  if (!trusted(req)) return json(res, 403, { error: "仅允许本机同源访问" });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.origin !== `http://${req.headers.host}`
  )
    return json(res, 403, { error: "需要同源 Origin" });
  const u = new URL(req.url, "http://" + req.headers.host);
  try {
    if (req.method === "GET" && u.pathname === "/api/settings")
      return json(res, 200, await publicSettings());
    if (req.method === "GET" && u.pathname === "/api/partner/robots")
      return json(res, 200, await partner.listRobots());
    if (req.method === 'GET' && u.pathname === '/api/partner/published-models')
      return json(res, 200, await partner.publishedModels());
    const bindingRoute = u.pathname.match(/^\/api\/partner\/robots\/([\w-]+)\/binding$/);
    if (req.method === 'PUT' && bindingRoute)
      return json(res, 200, await partner.updateModelBinding(bindingRoute[1], await body(req)));
    const presentationRoute = u.pathname.match(/^\/api\/partner\/robots\/([\w-]+)\/presentation$/);
    if (req.method === 'GET' && presentationRoute)
      return json(res, 200, partner.robotPresentation(presentationRoute[1]));
    if (req.method === "POST" && u.pathname === "/api/partner/robots")
      return json(res, 201, await partner.createRobot(await body(req)));
    if (req.method === "GET" && u.pathname === "/api/partner/catalog")
      return json(res, 200, await partner.catalog());
    if (req.method === 'GET' && u.pathname === '/api/partner/knowledge')
      return json(res, 200, await partner.listKnowledge());
    if (req.method === 'POST' && u.pathname === '/api/partner/knowledge')
      return json(res, 201, await partner.createKnowledge(await body(req)));
    const skillRoute = u.pathname.match(/^\/api\/partner\/skills\/([\w.-]+)\/versions\/([\w.-]+)$/);
    if (req.method === 'GET' && skillRoute) return json(res, 200, await partner.readSkill(skillRoute[1], skillRoute[2]));
    if (req.method === "GET" && u.pathname === "/api/partner/conversations")
      return json(res, 200, await partner.listCalls(Object.fromEntries(u.searchParams)));
    const robotRoute = u.pathname.match(/^\/api\/partner\/robots\/([\w-]+)(?:\/(validate|publish))?$/);
    if (robotRoute) {
      const [, id, action] = robotRoute;
      if (req.method === "PUT" && !action) return json(res, 200, await partner.saveRobot(id, await body(req)));
      if (req.method === "POST" && action === "validate") return json(res, 200, await partner.validateRobot(id, await body(req)));
      if (req.method === "POST" && action === "publish") return json(res, 200, await partner.publishRobot(id, await body(req)));
      if (req.method === "DELETE" && !action) return json(res, 200, await partner.deleteRobot(id));
    }
    const callRoute = u.pathname.match(/^\/api\/partner\/conversations\/([\w-]+)$/);
    if (req.method === "GET" && callRoute)
      return json(res, 200, await partner.callDetail(callRoute[1]));
    const callEventsRoute = u.pathname.match(/^\/api\/partner\/conversations\/([\w-]+)\/events$/);
    if (req.method === "GET" && callEventsRoute)
      return json(res, 200, await partner.callEvents(callEventsRoute[1], Object.fromEntries(u.searchParams)));
    if (req.method === "PUT" && u.pathname === "/api/settings") {
      if (design.activeDesign() || ws.clients.size)
        return json(res, 409, { error: "请先结束对话，再保存连接配置" });
      return json(res, 200, await updateSettings(await body(req)));
    }
    if (req.method === "POST" && u.pathname === "/api/check") {
      const input = await body(req);
      if (input.service === "voice") {
        const models = await voiceRequest("/v1/models");
        const s = await settings();
        return json(res, 200, {
          ok: Array.isArray(models) && models.some((m) => m.id === s.model),
          message:
            Array.isArray(models) && models.some((m) => m.id === s.model)
              ? "连接正常，当前模型可用"
              : "连接正常，但 Key 未开放当前模型",
        });
      }
      const b = await agentBinding();
      const a = await designRequest(`/openapi/studio/v1/agents/${b.agentId}`);
      return json(res, 200, {
        ok: !!a.publishedRelease,
        message: a.publishedRelease
          ? "连接正常，Design Agent 已发布"
          : "Agent 尚未发布",
      });
    }
    if (req.method === "POST" && u.pathname === "/api/voice/credential") {
      if (Date.now() - credentialAt < 10000)
        return json(res, 429, { error: "请间隔 10 秒再开始通话" });
      const input = await body(req), s = await settings();
      const bound = input.robotId ? await partner.robotForRuntime(input.robotId) : { model: s.model, config: {} };
      if (input.model && input.model !== bound.model) throw new Error("型号与机器人配置不一致");
      credentialAt = Date.now();
      const data = await voiceRequest("/voice/v1/webrtc/credentials", {
        method: "POST",
        body: JSON.stringify(credentialRequest(bound)),
      });
      if (!data.ws || !data.password) throw new Error("凭证响应不完整");
      return json(
        res,
        200,
        Object.fromEntries(
          [
            "ws",
            "uri",
            "target",
            "auth_user",
            "password",
            "expires_at",
            "session_id",
            "caller",
          ]
            .filter((k) => k in data)
            .map((k) => [k, data[k]]),
        ),
      );
    }
    if (req.method === "POST" && u.pathname === "/api/design/sessions")
      return json(res, 200, await design.createDesign());
    const m = u.pathname.match(
      /^\/api\/design\/sessions\/([\w-]+)(?:\/(run|cancel|interaction|events|file|files))?$/,
    );
    if (m) {
      const [, id, action] = m;
      if (req.method === "GET" && !action)
        return json(res, 200, design.getSession(id));
      if (req.method === "GET" && action === "events")
        return design.subscribe(id, res);
      if (req.method === "POST" && action === "run")
        return json(
          res,
          200,
          await design.startDesign(id, (await body(req)).text),
        );
      if (req.method === "POST" && action === "cancel")
        return json(res, 200, await design.cancelDesign(id));
      if (req.method === "POST" && action === "interaction")
        return json(
          res,
          200,
          await design.interact(id, (await body(req)).decision),
        );
      if (req.method === "PUT" && action === "files")
        return json(
          res,
          200,
          await design.uploadInput(
            id,
            u.searchParams.get("name"),
            await binaryBody(req),
            req.headers["x-file-type"],
          ),
        );
      if (req.method === "GET" && action === "file") {
        const p = u.searchParams.get("path"),
          content = await design.fileContent(id, p);
        res.setHeader(
          "Content-Type",
          Buffer.isBuffer(content)
            ? "application/octet-stream"
            : "text/plain; charset=utf-8",
        );
        if (u.searchParams.has("download"))
          res.setHeader(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(p))}`,
          );
        res.end(content);
        return;
      }
    }
    if (
      req.method === "GET" &&
      (u.pathname === "/sdk/latentx-voice.js" ||
        u.pathname === "/sdk/JsSIP-LICENSE.txt")
    ) {
      res.setHeader(
        "Content-Type",
        u.pathname.endsWith(".js") ? "text/javascript" : "text/plain",
      );
      res.end(
        await readFile(path.join(root, ".vendor", path.basename(u.pathname))),
      );
      return;
    }
    if (req.method === "GET" && !u.pathname.startsWith("/api/")) {
      const pathname = u.pathname === "/" ? "/index.html" : u.pathname;
      const workbenchFiles = new Set([
        "/index.html",
        "/app.js",
        "/style.css",
        "/workspace.css",
      ]);
      const isWorkbenchFile = workbenchFiles.has(pathname);
      const base = isWorkbenchFile ? workbench : path.join(root, "dist");
      const file = path.resolve(base, "." + pathname);
      if (!file.startsWith(base + path.sep)) return json(res, 404, { error: "Not found" });
      const type =
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
        }[path.extname(file)] || "application/octet-stream";
      res.setHeader("Content-Type", type);
      res.setHeader("Cache-Control", "no-store");
      res.end(await readFile(file));
      return;
    }
    return json(res, 404, { error: "Not found" });
  } catch (e) {
    return json(res, e.statusCode || (e.code === "ENOENT" ? 404 : 400), {
      requestId: e.requestId,
      error:
        e.code === "ENOENT"
          ? "尚未初始化，请检查配置或先构建前端"
          : e.message === "fetch failed"
            ? "服务暂时不可达，请检查地址和网络"
            : e.message,
    });
  }
});
server.on("upgrade", async (req, socket, head) => {
  if (
    !trusted(req) ||
    req.headers.origin !== `http://${req.headers.host}` ||
    !req.url.startsWith("/api/im") ||
    ws.clients.size >= 4
  ) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  try {
    const s = await settings(), u = new URL(req.url, `http://${req.headers.host}`);
    if (!s.voiceKey) throw new Error("missing");
    const bound = u.searchParams.get("robotId") ? await partner.robotForRuntime(u.searchParams.get("robotId")) : null;
    const runtime = bound ? { ...s, model: bound.model, published: true } : s;
    ws.handleUpgrade(req, socket, head, (client) => attachIM(client, runtime));
  } catch {
    socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Studio Partner · http://127.0.0.1:${port} · 真实服务（按使用计费）`,
  ),
);

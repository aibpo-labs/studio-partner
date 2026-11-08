import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { validateSettings, publicSettings } from "../server/settings.mjs";
import { attachIM } from "../server/im.mjs";
import { projectEvent } from "../server/design.mjs";
import { publicRobot } from "../server/partner.mjs";

test("configuration accepts endpoint changes, retains blank secrets, rejects credential URLs", () => {
  const current = {
    voiceBase: "https://api.latenth.com",
    voiceKey: "server-secret",
    model: "mini",
    designBase: "http://localhost/api",
    designToken: "private",
    agentId: "123",
    releaseId: "",
  };
  const updated = validateSettings(
    { voiceKey: "", designToken: "", model: "new" },
    current,
  );
  assert.equal(updated.voiceKey, current.voiceKey);
  assert.equal(updated.designToken, current.designToken);
  assert.equal(updated.model, "new");
  assert.throws(() =>
    validateSettings({ voiceBase: "https://user:pass@host" }, current),
  );
  assert.throws(() => validateSettings({ agentId: "../../admin" }, current));
});
test("configuration API projection never returns reusable keys", async () => {
  const s = await publicSettings();
  assert.equal(Object.hasOwn(s, "voiceKey"), false);
  assert.equal(Object.hasOwn(s, "designToken"), false);
  assert.equal(Object.hasOwn(s, "accessToken"), false);
});
test("Voice configuration can be saved before a Design Agent endpoint is configured", () => {
  const s = validateSettings({ model: "mini" }, {
    voiceBase: "https://api.latenth.com", voiceKey: "", model: "mini",
    designBase: "", designToken: "", agentId: "", releaseId: "",
  });
  assert.equal(s.designBase, "");
  assert.equal(s.model, "mini");
});
test("changing an endpoint does not silently forward the previous service key", () => {
  const current = {
    voiceBase: "https://api.latenth.com", voiceKey: "voice-secret", model: "mini",
    designBase: "https://agent.example.com/api", designToken: "agent-secret", agentId: "123", releaseId: "",
  };
  assert.throws(() => validateSettings({ designBase: "https://other.example.com/api", designToken: "" }, current));
  assert.throws(() => validateSettings({ voiceBase: "https://other.example.com", voiceKey: "" }, current));
  assert.equal(validateSettings({ designBase: "https://other.example.com/api", designToken: "new-token" }, current).designToken, "new-token");
});
class Socket extends EventEmitter {
  readyState = 1;
  sent = [];
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = 3;
  }
  event(v) {
    this.emit("message", Buffer.from(JSON.stringify(v)));
  }
}
test("IM waits for ready, preserves multi-turn socket and cancels upstream response", () => {
  const client = new Socket(),
    upstream = new Socket();
  let address;
  attachIM(
    client,
    { voiceBase: "https://api.latenth.com", voiceKey: "secret", model: "mini" },
    (url, opts) => {
      address = url;
      assert.equal(opts.headers.Authorization, "Bearer secret");
      return upstream;
    },
  );
  upstream.event({ type: "session.created" });
  assert.equal(upstream.sent[0].session.output_modalities[0], "text");
  client.event({ text: "too early" });
  assert.equal(upstream.sent.length, 1);
  upstream.event({ type: "session.updated" });
  client.event({ text: "hello" });
  assert.deepEqual(
    upstream.sent.slice(1).map((e) => e.type),
    ["conversation.item.create", "response.create"],
  );
  upstream.event({ type: "response.output_text.delta", delta: "你好" });
  upstream.event({
    type: "response.done",
    response: {
      status: "completed",
      usage: { input_tokens: 1, output_tokens: 2 },
    },
  });
  assert.equal(client.sent.at(-1).usage.output_tokens, 2);
  client.event({ text: "second" });
  client.event({ type: "cancel" });
  assert.equal(upstream.sent.at(-1).type, "response.cancel");
  assert.equal(address.searchParams.get("model"), "mini");
  assert.ok(!JSON.stringify(client.sent).includes("secret"));
  client.emit("close");
  assert.equal(upstream.readyState, 3);
});
test("Design projects text, approvals and terminal state independently of file generation", () => {
  const s = { messages: [{ role: "assistant", text: "" }] };
  projectEvent(s, { type: "text.delta", data: { delta: "方案" } });
  projectEvent(s, {
    type: "item.completed",
    data: { item: { type: "agentMessage", text: "方案" } },
  });
  assert.equal(s.messages[0].text, "方案");
  projectEvent(s, {
    type: "interaction.requested",
    data: { interactionId: "approval-1", detail: { command: "write config" } },
  });
  assert.equal(s.interaction.interactionId, "approval-1");
  projectEvent(s, { type: "interaction.resolved" });
  assert.equal(s.interaction, null);
  assert.equal(projectEvent(s, { type: "run.cancelled" }), "CANCELLED");
});
test("partner robot exposes its local binding ID while retaining the Voice PaaS model ID", () => {
  const robot = publicRobot(
    { id: "custom-model-id", name: "PaaS name", revision: 4, config: { name: "Demo" } },
    { id: "local-robot-id", customId: "custom-model-id", type: "im" },
  );
  assert.equal(robot.id, "local-robot-id");
  assert.equal(robot.customId, "custom-model-id");
  assert.equal(robot.type, "文本机器人");
  assert.equal(robot.icon, "chat");
});

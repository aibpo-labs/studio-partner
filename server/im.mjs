import WebSocket from "ws";
export function attachIM(
  client,
  config,
  createSocket = (...args) => new WebSocket(...args),
) {
  const url = new URL(config.voiceBase + "/v1/realtime");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("model", config.model);
  const remote = createSocket(url, {
    headers: { Authorization: `Bearer ${config.voiceKey}` },
    handshakeTimeout: 15000,
    maxPayload: 2 ** 20,
  });
  let ready = false,
    busy = false,
    closed = false,
    turns = 0,
    timer,
    streamText = "",
    lastResponseId = "";
  const send = (e) => {
    if (client.readyState === 1) client.send(JSON.stringify(e));
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    clearTimeout(lifetime);
    clearTimeout(handshake);
    remote.close();
    if (client.readyState === 1) client.close();
  };
  const fail = (message) => {
    send({ type: "error", message });
    close();
  };
  const handshake = setTimeout(() => fail("连接超时，请新建会话重试"), 20000);
  const lifetime = setTimeout(
    () => fail("会话达到 10 分钟，请新建会话"),
    600000,
  );
  remote.on("message", (raw) => {
    let e;
    try {
      e = JSON.parse(raw.toString());
    } catch {
      return fail("服务返回了无效事件");
    }
    if (e.type === "session.created")
      remote.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            output_modalities: ["text"],
            ...(config.published ? {} : { instructions: config.instructions || "你是简洁友好的中文客服助手，每次回答控制在100字内。" }),
            // Do not disable built-in knowledge search or on-demand Skill loading.
            // Published model resources are inherited from the service.
          },
        }),
      );
    else if (e.type === "session.updated") {
      ready = true;
      clearTimeout(handshake);
      send({ type: "ready", eventId: e.event_id, sessionId: e.session?.id });
    } else if (e.type === "response.output_text.delta" && busy)
      {
        streamText += e.delta || "";
        lastResponseId = e.response_id || lastResponseId;
        send({ type: "delta", delta: e.delta || "", eventId: e.event_id, responseId: e.response_id });
      }
    else if (e.type === "response.output_text.done" && busy) {
      // Some gateways omit deltas when a response is short. Use the complete event
      // only as a fallback; never append it after deltas or the UI would duplicate text.
      lastResponseId = e.response_id || lastResponseId;
      if (!streamText && e.text) {
        streamText = e.text;
        send({ type: "delta", delta: e.text, eventId: e.event_id, responseId: e.response_id, complete: true });
      }
    }
    else if (e.type === "response.done" && busy) {
      busy = false;
      clearTimeout(timer);
      const response = e.response || {};
      const status = response.status || "failed";
      send({
        type: "done",
        status,
        usage: response.usage,
        responseId: response.id || lastResponseId,
        eventId: e.event_id,
        statusDetails: response.status_details || undefined,
      });
      streamText = "";
      lastResponseId = "";
    } else if (e.type === "error") {
      // Keep the public message stable while retaining the event id for diagnostics.
      send({ type: "error", message: "PaaS 请求失败，请检查连接配置、模型权限和额度", eventId: e.event_id, code: e.error?.code });
      close();
    }
  });
  remote.on("error", () => fail("无法连接 Voice PaaS，请检查地址和 Key"));
  remote.on("close", () => {
    if (!closed) fail("云端连接已关闭，下次发送将使用新会话");
  });
  client.on("message", (raw) => {
    let e;
    try {
      e = JSON.parse(raw.toString());
    } catch {
      return send({ type: "error", message: "无效消息" });
    }
    if (e.type === "cancel") {
      if (busy && remote.readyState === 1)
        remote.send(JSON.stringify({ type: "response.cancel" }));
      return;
    }
    if (
      !ready ||
      busy ||
      typeof e.text !== "string" ||
      !e.text.trim() ||
      e.text.length > 4000
    )
      return send({
        type: "error",
        message: "请等待当前回复结束，消息长度为 1–4000 字",
      });
    if (++turns > 20) return fail("当前会话达到 20 轮，请新建会话");
    busy = true;
    streamText = "";
    lastResponseId = "";
    send({ type: "accepted" });
    remote.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: e.text.trim() }],
        },
      }),
    );
    remote.send(JSON.stringify({ type: "response.create" }));
    timer = setTimeout(() => {
      if (remote.readyState === 1)
        remote.send(JSON.stringify({ type: "response.cancel" }));
      fail("响应超时，已结束本次会话");
    }, 90000);
  });
  client.on("close", close);
  client.on("error", close);
}

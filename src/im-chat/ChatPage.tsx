import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Camera,
  ChevronLeft,
  CirclePlus,
  CircleX,
  Headset,
  ImageIcon,
  LoaderCircle,
  MessageCircle,
  MessageSquareMore,
  Plus,
  Search,
  Send,
  User,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  imCardFromEvent,
  isImCardContract,
  type ImCardAction,
  type ImCardModel,
} from "./card-model";
import { IM_CARD_COMPONENTS } from "./card-contracts";
import { ImCardRenderer } from "./cards";
import { getImPresentation, type ImPresentation } from "./presentation";
import { useImEventStream } from "./use-im-event-stream";
import { WelcomePanels } from "./welcome-panels";
import {
  ApiError,
  createPublicTextSession,
  getPublicTextServiceRobot,
  getPublicTextSession,
  sendPublicTextMessage,
  submitPublicTextCardAction,
  type TextTranscriptLine,
  type TextImageAttachment,
  type TextTurnEvent,
} from "./transport";
import { closeTextSession, getChatCapabilities } from "./transport";
const createBrowserRequestId = () => crypto.randomUUID();
const capabilities = getChatCapabilities();

type TimelineItem =
  | { kind: "message"; key: string; message: TextTranscriptLine }
  | { kind: "card"; key: string; card: ImCardModel };

function isTextServiceConflict(cause: unknown): cause is ApiError {
  return cause instanceof ApiError && cause.code === "409";
}

function publicServiceName(name: string): string {
  return name.trim().replace(/(?:IM)?智能客服|机器人/gi, "在线客服") || "在线客服";
}

function hiddenActionTurnStorageKey(robotId: string, sessionId: string): string {
  return `studio-partner:h5:hidden-actions:${robotId}:${sessionId}`;
}

function readHiddenActionTurnIds(robotId: string, sessionId: string): Set<string> {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(hiddenActionTurnStorageKey(robotId, sessionId)) ?? "[]",
    );
    return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeHiddenActionTurnIds(robotId: string, sessionId: string, turnIds: Set<string>) {
  try {
    window.sessionStorage.setItem(
      hiddenActionTurnStorageKey(robotId, sessionId),
      JSON.stringify([...turnIds].slice(-100)),
    );
  } catch {
    // The current interaction still stays clean when browser storage is unavailable.
  }
}

function conversationTimeline(
  messages: TextTranscriptLine[],
  cards: ImCardModel[],
): TimelineItem[] {
  const timeline: TimelineItem[] = [];
  const inserted = new Set<string>();
  for (const [index, message] of messages.entries()) {
    const matchingCards =
      message.role === "assistant" && message.turnId
        ? cards.filter((card) => card.turnId === message.turnId && !inserted.has(card.cardId))
        : [];
    if (matchingCards.length) {
      for (const card of matchingCards) {
        timeline.push({ kind: "card", key: `card-${card.cardId}`, card });
        inserted.add(card.cardId);
      }
      // A card already carries the business content. The assistant sentence for
      // the same turn is only a transport hint such as "please view the card".
      continue;
    }
    timeline.push({
      kind: "message",
      key: `message-${message.turnId ?? message.createdAt}-${index}`,
      message,
    });
  }
  for (const card of [...cards].sort((a, b) => a.sequence - b.sequence)) {
    if (!inserted.has(card.cardId)) {
      timeline.push({ kind: "card", key: `card-${card.cardId}`, card });
    }
  }
  return timeline;
}

export default function ChatPage({ robotId = "im" }: { robotId?: string }) {
  const presentation = getImPresentation(robotId);
  const [robotName, setRobotName] = useState("在线客服");
  const [robotError, setRobotError] = useState("");
  const [sessionInput, setSessionInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<TextTranscriptLine[]>([]);
  const [draft, setDraft] = useState("");
  const [streamText, setStreamText] = useState("");
  const [turnFinalized, setTurnFinalized] = useState(false);
  const [turnHasCard, setTurnHasCard] = useState(false);
  const [cards, setCards] = useState<ImCardModel[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const streamTurnRef = useRef("");
  const hiddenActionTurnIdsRef = useRef<Set<string>>(new Set());
  const optimisticImageURLsRef = useRef<string[]>([]);
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      for (const url of optimisticImageURLsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );

  useEffect(() => {
    void getPublicTextServiceRobot(robotId)
      .then((robot) => setRobotName(publicServiceName(robot.name)))
      .catch((cause) => setRobotError(cause instanceof Error ? cause.message : "客服当前不可用"));
  }, [robotId]);

  const refresh = useCallback(
    async (id: string) => {
      const detail = await getPublicTextSession(robotId, id);
      setMessages(
        (detail.messages ?? []).filter(
          (message) =>
            message.role !== "user" ||
            !message.turnId ||
            !hiddenActionTurnIdsRef.current.has(message.turnId),
        ),
      );
      for (const url of optimisticImageURLsRef.current) URL.revokeObjectURL(url);
      optimisticImageURLsRef.current = [];
    },
    [robotId],
  );

  const hideActionTurn = useCallback(
    (id: string, turnId: string) => {
      if (!turnId) return;
      hiddenActionTurnIdsRef.current.add(turnId);
      writeHiddenActionTurnIds(robotId, id, hiddenActionTurnIdsRef.current);
      setMessages((current) =>
        current.filter(
          (message) => message.role !== "user" || !message.turnId || message.turnId !== turnId,
        ),
      );
    },
    [robotId],
  );

  const enter = async (id: string) => {
    const normalized = id.trim();
    if (!normalized) return;
    setBusy(true);
    setError("");
    try {
      hiddenActionTurnIdsRef.current = readHiddenActionTurnIds(robotId, normalized);
      await refresh(normalized);
      setSessionId(normalized);
      setSessionInput(normalized);
      setCards([]);
      setShowWelcome(false);
      setStreamText("");
      setTurnFinalized(false);
      setTurnHasCard(false);
      setRunning(false);
      streamTurnRef.current = "";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "无法恢复会话");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createPublicTextSession(robotId);
      hiddenActionTurnIdsRef.current = new Set();
      setMessages([]);
      setStreamText("");
      setTurnFinalized(false);
      setTurnHasCard(false);
      setCards([]);
      setShowWelcome(true);
      setRunning(false);
      streamTurnRef.current = "";
      setSessionId(result.sessionId);
      setSessionInput(result.sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "创建会话失败");
    } finally {
      setBusy(false);
    }
  };

  const onTurnEvent = useCallback(
    (event: TextTurnEvent) => {
      if (event.type === "AGENT_START") {
        streamTurnRef.current = event.turnId;
        setStreamText("");
        setTurnFinalized(false);
        setTurnHasCard(false);
        setRunning(true);
      }
      if (event.type === "RESPONSE_DELTA") {
        setTurnFinalized(false);
        setStreamText((current) => {
          if (streamTurnRef.current !== event.turnId) {
            streamTurnRef.current = event.turnId;
            return event.content ?? "";
          }
          return current + (event.content ?? "");
        });
      }
      if (["RESPONSE", "FINAL_RESULT"].includes(event.type)) {
        streamTurnRef.current = event.turnId;
        setTurnFinalized(true);
        if (event.content) setStreamText(event.content);
        void refresh(sessionId)
          .then(() => {
            if (streamTurnRef.current === event.turnId) setStreamText("");
          })
          .catch((cause) => setError(cause instanceof Error ? cause.message : "刷新会话失败"));
      }
      if (event.type === "AGENT_END") {
        setRunning(false);
        setTurnFinalized(false);
        setStreamText("");
        void refresh(sessionId).catch((cause) =>
          setError(cause instanceof Error ? cause.message : "刷新会话失败"),
        );
      }
      if (event.type === "ERROR") {
        setRunning(false);
        setTurnFinalized(false);
        setStreamText("");
        setError(event.content || "本次回复超时或生成失败，请重新发送消息。");
        void refresh(sessionId).catch(() => undefined);
      }
      if (event.type === "IM_CARD") {
        const next = imCardFromEvent(event);
        if (!next) return;
        setTurnHasCard(true);
        setCards((current) => {
          const existing = current.find((item) => item.cardId === next.cardId);
          return existing
            ? current.map((item) =>
                item.cardId === next.cardId
                  ? {
                      ...next,
                      actionAccepted: item.actionAccepted,
                      submittingActionId: item.submittingActionId,
                    }
                  : item,
              )
            : [...current, next];
        });
      }
      if (event.type === "IM_ACTION") {
        const cardId = String(event.metadata?.cardId ?? "");
        setCards((current) =>
          current.map((item) =>
            item.cardId === cardId
              ? { ...item, actionAccepted: true, submittingActionId: null }
              : item,
          ),
        );
      }
    },
    [refresh, sessionId],
  );

  const eventStreamState = useImEventStream({ robotId, sessionId, onEvent: onTurnEvent });

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    // Scroll only the message viewport. scrollIntoView also moves the page and
    // can lift the fixed composer to the top while a streamed reply is growing.
    conversation.scrollTo({ top: conversation.scrollHeight, behavior: "auto" });
  }, [messages, streamText, cards, running, turnHasCard]);

  const sendText = async (value: string, images: File[] = [], hideUserMessage = false) => {
    const text = value.trim();
    if (!sessionId || (!text && !images.length) || busy || running) return false;
    setBusy(true);
    setRunning(true);
    setTurnFinalized(false);
    setTurnHasCard(false);
    setDraft("");
    setError("");
    const optimisticAttachments: TextImageAttachment[] = images.map((image) => {
      const url = URL.createObjectURL(image);
      optimisticImageURLsRef.current.push(url);
      return { type: "image", url, mimeType: image.type, sizeBytes: image.size };
    });
    if (!hideUserMessage) {
      setMessages((current) => [
        ...current,
        {
          role: "user",
          text,
          attachments: optimisticAttachments,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    try {
      const turn = await sendPublicTextMessage(robotId, sessionId, text, images);
      if (hideUserMessage) hideActionTurn(sessionId, turn.turnId);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发送失败");
      // A conflicting turn remains locked until its terminal event.
      if (!isTextServiceConflict(cause)) setRunning(false);
      await refresh(sessionId).catch(() => undefined);
      setDraft(text);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const runCardAction = async (card: ImCardModel, action: ImCardAction) => {
    if (action.prompt) {
      await sendText(action.prompt, [], true);
      return;
    }
    if (!sessionId || card.actionAccepted || card.submittingActionId || busy || running) return;
    setBusy(true);
    setRunning(true);
    setCards((current) =>
      current.map((item) =>
        item.cardId === card.cardId ? { ...item, submittingActionId: action.id } : item,
      ),
    );
    try {
      const turn = await submitPublicTextCardAction(robotId, sessionId, {
        cardId: card.cardId,
        actionId: action.id,
        idempotencyKey: createBrowserRequestId(),
        payload: action.payload,
      });
      hideActionTurn(sessionId, turn.turnId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "卡片操作失败");
      // 卡片冲突由后续 IM_ACTION/AGENT_END 收敛，期间保持交互禁用，避免换新幂等键重试。
      if (!isTextServiceConflict(cause)) setRunning(false);
      setCards((current) =>
        current.map((item) =>
          item.cardId === card.cardId ? { ...item, submittingActionId: null } : item,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    closeTextSession(robotId, sessionId);
    setSessionId("");
    setMessages([]);
    setStreamText("");
    setTurnFinalized(false);
    setTurnHasCard(false);
    setCards([]);
    setShowWelcome(false);
    setShowEndDialog(false);
    setRunning(false);
    streamTurnRef.current = "";
    hiddenActionTurnIdsRef.current = new Set();
    setError("");
  };

  const welcomeEntityCard = cards.find(
    (card) =>
      isImCardContract(card, IM_CARD_COMPONENTS.content) &&
      card.properties.variant === "entity" &&
      card.properties.placement === "welcome",
  );
  const timelineCards = welcomeEntityCard
    ? cards.filter((card) => card.cardId !== welcomeEntityCard.cardId)
    : cards;
  const handoffCard = [...cards]
    .reverse()
    .find(
      (card) =>
        isImCardContract(card, IM_CARD_COMPONENTS.status) &&
        card.properties.context === "human-handoff",
    );
  const handoffState = String(handoffCard?.properties.state ?? "");
  const humanConnected = handoffState === "active";
  const humanQueued = handoffState === "progress";

  return (
    <main className="min-h-dvh bg-[#E6E8EC] text-[#16181D] sm:grid sm:place-items-center sm:p-5">
      <section className="relative flex h-dvh min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-[#F2F3F5] sm:h-[min(860px,calc(100dvh-2.5rem))] sm:min-h-0 sm:rounded-[24px] sm:shadow-[0_24px_70px_rgba(22,24,29,0.18)]">
        <header className="relative z-30 flex h-11 shrink-0 items-center border-b border-[#EDEEF1] bg-white/90 px-1.5 backdrop-blur-xl">
          <button
            type="button"
            onClick={sessionId ? leave : undefined}
            aria-label={sessionId ? "返回" : "在线客服"}
            disabled={!sessionId}
            className="grid size-[38px] place-items-center rounded-full text-[#16181D] enabled:active:bg-[#EEF0F3] disabled:text-[#9299A6]"
          >
            {sessionId ? (
              <ChevronLeft className="size-[22px]" strokeWidth={2.1} />
            ) : (
              <MessageCircle className="size-5" />
            )}
          </button>
          <h1 className="pointer-events-none absolute inset-x-12 truncate text-center text-[17px] font-semibold tracking-[-0.02em]">
            {robotName}
          </h1>
          {sessionId ? (
            <button
              type="button"
              disabled={busy || running || humanQueued || !capabilities.handoff}
              title={capabilities.handoff ? "人工服务交互示例" : "当前服务尚未配置人工客服"}
              onClick={() => {
                if (humanConnected) setShowEndDialog(true);
                else void sendText("转人工服务", [], true);
              }}
              aria-label={humanConnected ? "结束人工服务" : humanQueued ? "正在排队" : "转人工客服"}
              className="ml-auto grid size-[38px] place-items-center rounded-full text-[#16181D] enabled:active:bg-[#EEF0F3] disabled:text-[#9299A6]"
            >
              {humanConnected ? (
                <CircleX className="size-[21px]" strokeWidth={1.7} />
              ) : (
                <MessageSquareMore className="size-[21px]" strokeWidth={1.7} />
              )}
            </button>
          ) : (
            <span className="ml-auto block size-[38px]" aria-hidden="true" />
          )}
        </header>

        {robotError ? (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-red-600">
            {robotError}
          </div>
        ) : !sessionId ? (
          <SessionEntry
            description={presentation.entryDescription}
            busy={busy}
            error={error}
            robotName={robotName}
            sessionInput={sessionInput}
            onSessionInput={setSessionInput}
            onCreate={() => void create()}
            onEnter={() => void enter(sessionInput)}
          />
        ) : (
          <>
            <div
              ref={conversationRef}
              className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overflow-x-hidden px-3.5 pb-3 pt-1 [scrollbar-width:none]"
            >
              <p className="py-0.5 text-center text-xs text-[#9299A6]">当前会话</p>
              <details className="text-center text-[10px] text-[#9299A6]"><summary className="cursor-pointer">会话编号</summary><span className="break-all select-all">{sessionId}</span></details>
              {showWelcome ? (
                <WelcomePanels
                  key={robotId}
                  presentation={presentation}
                  disabled={busy || running}
                  onPrompt={(text) => void sendText(text)}
                  featuredCard={
                    welcomeEntityCard ? (
                      <div className="ml-[45px] max-w-[calc(100%-45px)]">
                        <ImCardRenderer
                          card={welcomeEntityCard}
                          disabled={busy || running}
                          onAction={(action) => void runCardAction(welcomeEntityCard, action)}
                        />
                      </div>
                    ) : undefined
                  }
                />
              ) : null}
              {conversationTimeline(messages, timelineCards).map((item) =>
                item.kind === "message" ? (
                  <Bubble key={item.key} message={item.message} />
                ) : (
                  <div key={item.key} className="ml-[45px] max-w-[calc(100%-45px)]">
                    <ImCardRenderer
                      card={item.card}
                      disabled={
                        busy ||
                        running ||
                        item.card.actionAccepted ||
                        Boolean(item.card.submittingActionId)
                      }
                      onAction={(action) => void runCardAction(item.card, action)}
                    />
                  </div>
                ),
              )}
              {streamText && !turnHasCard ? (
                <Bubble
                  message={{ role: "assistant", text: streamText, createdAt: "" }}
                  streaming
                />
              ) : null}
              {running && !streamText && !turnFinalized && !turnHasCard ? (
                <ReplyTypingIndicator />
              ) : null}
            </div>
            {error ? (
              <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                {error}
              </p>
            ) : null}
            {eventStreamState === "retrying" ? (
              <p className="border-t border-[#EDEEF1] bg-white px-4 py-1.5 text-center text-xs text-[#9299A6]">
                连接中断，正在恢复…
              </p>
            ) : null}
            <ChatComposer
              presentation={presentation}
              busy={busy || running}
              draft={draft}
              onDraft={setDraft}
              onSend={(text, images) => sendText(text, images)}
            />
          </>
        )}
        {showEndDialog ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-human-title"
            className="absolute inset-0 z-50 flex items-end bg-black/30"
            onClick={(event) => {
              if (event.currentTarget === event.target) setShowEndDialog(false);
            }}
          >
            <div className="w-full rounded-t-[20px] bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
              <h2 id="end-human-title" className="text-center text-[17px] font-semibold">
                结束对话
              </h2>
              <p className="my-2 text-center text-sm/6 text-[#5A6272]">
                确定要结束本次人工对话吗？结束后可以评价本次服务，智能助理将继续为您服务。
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEndDialog(false)}
                  className="rounded-xl bg-[#F5F6F8] px-3 py-3 text-base font-medium"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEndDialog(false);
                    void sendText("结束人工服务", [], true);
                  }}
                  className="rounded-xl bg-[#2E76E8] px-3 py-3 text-base font-medium text-white"
                >
                  结束对话
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SessionEntry({
  description,
  busy,
  error,
  robotName,
  sessionInput,
  onSessionInput,
  onCreate,
  onEnter,
}: {
  description?: string;
  busy: boolean;
  error: string;
  robotName: string;
  sessionInput: string;
  onSessionInput: (value: string) => void;
  onCreate: () => void;
  onEnter: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-[18px] bg-gradient-to-b from-[#EDF3FD] to-[#E1EBFA] text-[#3E6FBF]">
          <Headset className="size-8" strokeWidth={1.6} />
        </span>
        <h2 className="mt-5 text-xl font-semibold">开始咨询</h2>
        <p className="mt-2 text-sm/6 text-[#5A6272]">
          {description ?? `${robotName}将为您解答产品与服务问题。`}
        </p>
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2E76E8] px-4 py-3 text-sm font-semibold text-white active:bg-[#1F60CC] disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
          开始新对话
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-[#9299A6]">
          <span className="h-px flex-1 bg-[#EDEEF1]" />
          恢复已有会话
          <span className="h-px flex-1 bg-[#EDEEF1]" />
        </div>
        <input
          value={sessionInput}
          onChange={(event) => onSessionInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onEnter();
          }}
          aria-label="会话编号"
          placeholder="输入会话编号"
          className="w-full rounded-xl bg-white px-4 py-3 text-sm outline-none ring-1 ring-[#EDEEF1] focus:ring-2 focus:ring-[#2E76E8]"
        />
        <button
          type="button"
          onClick={onEnter}
          disabled={busy || !sessionInput.trim()}
          className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-[#5A6272] ring-1 ring-[#EDEEF1] active:bg-[#F5F6F8] disabled:opacity-40"
        >
          进入会话
        </button>
        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
      </div>
    </div>
  );
}

function ChatComposer({
  presentation,
  busy,
  draft,
  onDraft,
  onSend,
}: {
  presentation: ImPresentation;
  busy: boolean;
  draft: string;
  onDraft: (value: string) => void;
  onSend: (value: string, images: File[]) => Promise<boolean>;
}) {
  const { inputSuggestions, followUpPrompts } = presentation;
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [images, setImages] = useState<Array<{ id: string; file: File; url: string }>>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const previewURLsRef = useRef(new Set<string>());
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  useEffect(
    () => () => {
      for (const url of previewURLsRef.current) URL.revokeObjectURL(url);
    },
    [],
  );
  const query = draft.trim().toLowerCase();
  const suggestions = query
    ? inputSuggestions
        .filter(
          (suggestion) =>
            suggestion.label.toLowerCase().includes(query) ||
            suggestion.prompt.toLowerCase().includes(query) ||
            (query.length > 1 && suggestion.label.includes(draft.trim().slice(0, 2))),
        )
        .slice(0, 4)
    : [];
  useEffect(() => {
    if (!suggestionsOpen) return;
    const dismissOutside = (event: PointerEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) setSuggestionsOpen(false);
    };
    const dismissWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSuggestionsOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissWithEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissWithEscape);
    };
  }, [suggestionsOpen]);
  const submittingRef = useRef(false);
  const submit = async (value: string) => {
    if (busy || submittingRef.current || (!value.trim() && !images.length)) return;
    submittingRef.current = true;
    try {
      const accepted = await onSend(value, images.map((item) => item.file));
      setSuggestionsOpen(false);
      if (!accepted) return;
      setAttachmentsOpen(false);
      setAttachmentNotice("");
      for (const image of images) {
        URL.revokeObjectURL(image.url);
        previewURLsRef.current.delete(image.url);
      }
      setImages([]);
    } finally { submittingRef.current = false; }
  };
  const addImages = (selected: File[]) => {
    if (!selected.length) return;
    if (!capabilities.images) { setAttachmentNotice("当前连接仅支持文本消息。"); return; }
    const remaining = Math.max(0, 3 - images.length);
    const valid: Array<{ id: string; file: File; url: string }> = [];
    let rejected = selected.length > remaining;
    for (const file of selected.slice(0, remaining)) {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024
      ) {
        rejected = true;
        continue;
      }
      const url = URL.createObjectURL(file);
      previewURLsRef.current.add(url);
      valid.push({ id: createBrowserRequestId(), file, url });
    }
    setImages((current) => [...current, ...valid]);
    setAttachmentNotice(rejected ? "最多 3 张；仅支持 JPEG、PNG、WebP，单张不超过 5MB。" : "");
  };
  const selectImages = (event: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(event.target.files ?? []));
    event.target.value = "";
  };
  const removeImage = (id: string) => {
    setImages((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
        previewURLsRef.current.delete(removed.url);
      }
      return current.filter((item) => item.id !== id);
    });
  };
  return (
    <div ref={composerRef} className="relative z-20 shrink-0 border-t border-[#EDEEF1] bg-white/90 backdrop-blur-xl">
      {suggestionsOpen && suggestions.length ? (
        <div className="absolute inset-x-2.5 bottom-full mb-1.5 overflow-hidden rounded-[14px] bg-white shadow-[0_8px_30px_rgba(16,24,40,0.12)]">
          <div className="flex items-center justify-between border-b border-[#EDEEF1] px-3.5 py-2 text-xs text-[#9299A6]">
            <span>匹配建议</span>
            <button type="button" onClick={() => setSuggestionsOpen(false)} aria-label="关闭建议" className="grid size-6 place-items-center rounded-full hover:bg-[#F5F6F8]">
              <X className="size-4" />
            </button>
          </div>
          {suggestions.map(({ label, prompt }) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              onClick={() => submit(prompt)}
              className="flex w-full items-center gap-2.5 border-t border-[#EDEEF1] px-3.5 py-3 text-left text-[15px] first:border-t-0 disabled:opacity-50"
            >
              <Search className="size-4 shrink-0 text-[#B9BFC9]" strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-1 pt-2 [scrollbar-width:none]">
        {followUpPrompts.map(({ label, prompt }) => (
          <button
            key={prompt}
            type="button"
            disabled={busy}
            onClick={() => submit(prompt)}
            className="shrink-0 rounded-full bg-[#F5F6F8] px-3 py-1.5 text-[13px] text-[#16181D] active:bg-[#EAF1FD] active:text-[#2E76E8] disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2.5 px-3.5 pb-[max(9px,env(safe-area-inset-bottom))] pt-2">
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={selectImages}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          hidden
          onChange={selectImages}
        />
        <textarea
          value={draft}
          maxLength={4000}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter(file => file.type.startsWith("image/"));
            if (files.length) { event.preventDefault(); addImages(files); setAttachmentsOpen(true); }
          }}
          onChange={(event) => {
            onDraft(event.target.value);
            setSuggestionsOpen(Boolean(event.target.value.trim()));
          }}
          onFocus={() => setSuggestionsOpen(Boolean(query))}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(draft);
            }
          }}
          rows={1}
          placeholder="请输入您要咨询的问题"
          aria-label="消息内容"
          className="h-[42px] max-h-[110px] min-w-0 flex-1 resize-none overflow-y-auto rounded-2xl bg-[#F5F6F8] px-3.5 py-2.5 text-[15.5px]/[22px] outline-none placeholder:text-[#9299A6] focus:bg-[#EEF0F3]"
        />
        <button type="button" disabled={busy || !capabilities.images}
          title={capabilities.images ? "添加图片或拍照" : "当前连接仅支持文本消息"}
          onClick={() => { setAttachmentsOpen(value => !value); setAttachmentNotice(""); }}
          aria-label="添加图片或拍照" aria-expanded={attachmentsOpen}
          className="grid size-[42px] shrink-0 place-items-center text-[#2E76E8] disabled:opacity-40">
          <CirclePlus className={`size-6 transition-transform ${attachmentsOpen ? "rotate-45" : ""}`} strokeWidth={1.8}/>
        </button>
        {draft.trim() || images.length ? <button type="button" onClick={() => void submit(draft)} disabled={busy} aria-label="发送"
          className="grid h-[38px] min-w-[42px] place-items-center rounded-xl bg-[#2E76E8] px-3 text-white active:scale-95 disabled:opacity-35">
          {busy ? <LoaderCircle className="size-4 animate-spin"/> : <Send className="size-4"/>}
        </button> : null}
      </div>
      {attachmentsOpen ? (
        <div className="border-t border-[#EDEEF1] bg-[#F5F6F8] px-5 py-4">
          {images.length ? (
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {images.map((image) => (
                <div key={image.id} className="relative shrink-0">
                  <img
                    src={image.url}
                    alt="待发送图片"
                    className="size-[72px] rounded-xl object-cover"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => removeImage(image.id)}
                    aria-label="删除图片"
                    className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#16181D] text-white"
                  >
                    <CircleX className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex gap-6">
            {[
              { label: "照片", icon: ImageIcon },
              { label: "拍照", icon: Camera },
            ].map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                disabled={busy || images.length >= 3 || !capabilities.images}
                onClick={() =>
                  (label === "照片" ? photoInputRef.current : cameraInputRef.current)?.click()
                }
                className="flex min-w-16 flex-col items-center gap-2 text-xs text-[#5A6272] disabled:opacity-40"
              >
                <span className="grid size-[60px] place-items-center rounded-2xl bg-white text-[#16181D]">
                  <Icon className="size-7" strokeWidth={1.6} />
                </span>
                {label}
              </button>
            ))}
          </div>
          {attachmentNotice ? (
            <p className="mt-3 text-xs/5 text-[#9299A6]">{attachmentNotice}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Bubble({
  message,
  streaming = false,
}: {
  message: TextTranscriptLine;
  streaming?: boolean;
}) {
  const user = message.role === "user";
  const imageAttachments = (message.attachments ?? []).filter(
    (item) => item.type === "image" && item.url,
  );
  return (
    <div className={`flex items-start gap-[9px] ${user ? "flex-row-reverse" : ""}`}>
      <span
        className={`grid size-9 shrink-0 place-items-center rounded-xl ${
          user
            ? "bg-[#EEF0F3] text-[#5A6272]"
            : "bg-gradient-to-b from-[#EDF3FD] to-[#E1EBFA] text-[#3E6FBF]"
        }`}
      >
        {user ? (
          <User className="size-5" strokeWidth={1.7} />
        ) : (
          <Headset className="size-5" strokeWidth={1.7} />
        )}
      </span>
      <div
        className={`max-w-[calc(100%-45px)] break-words rounded-[18px] px-3.5 py-2.5 text-[15.5px]/[1.62] ${
          user ? "rounded-tr-lg bg-[#2E76E8] text-white" : "rounded-tl-lg bg-white text-[#16181D]"
        }`}
      >
        {imageAttachments.length ? (
          <div
            className={`grid gap-1.5 ${imageAttachments.length > 1 ? "grid-cols-2" : ""} ${message.text ? "mb-2" : ""}`}
          >
            {imageAttachments.map((attachment, index) => (
              <a
                key={`${attachment.url}-${index}`}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-xl"
              >
                <img
                  src={attachment.url}
                  alt={`用户上传图片 ${index + 1}`}
                  className="max-h-52 w-full object-cover"
                />
              </a>
            ))}
          </div>
        ) : null}
        {user ? (
          message.text ? (
            <span className="whitespace-pre-wrap">{message.text}</span>
          ) : null
        ) : (
          <div className="prose prose-sm max-w-none text-[#16181D] prose-headings:text-[#16181D] prose-p:my-0 prose-ol:my-2 prose-ul:my-2 prose-li:my-1">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
          </div>
        )}
        {streaming ? (
          <span className="ml-1 inline-block h-[1em] w-0.5 animate-pulse bg-[#2E76E8] align-[-0.14em]" />
        ) : null}
      </div>
    </div>
  );
}

function ReplyTypingIndicator() {
  return (
    <div className="flex items-start gap-[9px]">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#EDF3FD] to-[#E1EBFA] text-[#3E6FBF]">
        <Headset className="size-5" strokeWidth={1.7} />
      </span>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="flex h-10 items-center gap-1.5 rounded-[18px] rounded-tl-lg bg-white px-4 shadow-[0_4px_16px_rgba(22,24,29,0.035)]"
      >
        <span className="sr-only">客服正在回复</span>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            aria-hidden="true"
            className="size-2 animate-bounce rounded-full bg-[#9BA4B3] motion-reduce:animate-none"
            style={{ animationDelay: `${index * 120}ms`, animationDuration: "1s" }}
          />
        ))}
      </div>
    </div>
  );
}

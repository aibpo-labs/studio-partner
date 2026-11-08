import {
  BookOpenText,
  CarFront,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  Download,
  FileText,
  GitBranch,
  Headphones,
  LoaderCircle,
  Star,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { record, text, type ImCardAction, type ImCardModel } from "./card-model";
import { IM_CARD_COMPONENTS, type ImCardComponentKey } from "./card-contracts";

interface CardRendererProps {
  card: ImCardModel;
  disabled: boolean;
  onAction: (action: ImCardAction) => void;
}

type CardRenderer = ComponentType<CardRendererProps>;

function ProgressiveText({ value, className }: { value: string; className?: string }) {
  const [visible, setVisible] = useState(0);
  useEffect(() => {
    setVisible(0);
    if (!value) return;
    const chunk = Math.max(1, Math.ceil(value.length / 55));
    const timer = window.setInterval(() => {
      setVisible((current) => {
        const next = Math.min(value.length, current + chunk);
        if (next >= value.length) window.clearInterval(timer);
        return next;
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [value]);
  return (
    <p className={className}>
      {value.slice(0, visible)}
      {visible < value.length ? (
        <span className="ml-0.5 inline-block h-[1em] w-0.5 animate-pulse bg-[#2E76E8] align-[-0.14em]" />
      ) : null}
    </p>
  );
}

const CARD_ICONS = {
  car: CarFront,
  check: CircleCheck,
  clock: Clock3,
  download: Download,
  file: FileText,
  headphones: Headphones,
} as const;

type CardIconName = keyof typeof CARD_ICONS;

function cardIcon(value: unknown, fallback: CardIconName) {
  const name = text(value);
  return Object.hasOwn(CARD_ICONS, name) ? CARD_ICONS[name as CardIconName] : CARD_ICONS[fallback];
}

function QaCard({ card, disabled, onAction }: CardRendererProps) {
  const questions = choiceOptions(card.properties.related_questions);
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="border-b border-[#EDEEF1] px-4 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#2E76E8]">
          <BookOpenText className="size-4" strokeWidth={1.8} />
          {text(card.properties.answer_label, "知识库标准答案")}
        </p>
        <h3 className="mt-2 text-[15.5px]/6 font-semibold text-[#16181D]">
          {text(card.properties.question, "问题")}
        </h3>
        <ProgressiveText
          className="mt-3 whitespace-pre-wrap text-sm/6 text-[#5A6272]"
          value={text(card.properties.answer, "暂未找到标准答案。")}
        />
      </div>
      {questions.length ? (
        <div className="px-4 pb-1 pt-3">
          <p className="text-xs text-[#9299A6]">相关问题</p>
          <div className="mt-1 divide-y divide-[#EDEEF1]">
            {questions.map((question) => (
              <button
                key={question.id}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onAction({
                    id: question.id,
                    label: question.label,
                    prompt: question.prompt,
                  })
                }
                className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-[#2E76E8] disabled:opacity-50"
              >
                <span>{question.label}</span>
                <ChevronRight className="size-4 shrink-0 text-[#B9BFC9]" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

interface SopBranch {
  id: string;
  label: string;
  description?: string;
}

function sopBranches(value: unknown): SopBranch[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    const id = text(source.id);
    const label = text(source.label);
    return id && label ? [{ id, label, description: text(source.description) || undefined }] : [];
  });
}

function SopFirstTurnCard({ card, disabled, onAction }: CardRendererProps) {
  const branches = sopBranches(card.properties.branches);
  const selectAction = card.actions.find((action) => action.id === "select");
  return (
    <section className="overflow-hidden rounded-2xl border-l-4 border-[#C8AA6A] bg-white shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="border-b border-[#EDEEF1] px-4 py-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[#AA8C50]">
          <GitBranch className="size-4" strokeWidth={1.8} />
          {text(card.properties.eyebrow, "SOP 流程引导")}
        </p>
        <h3 className="mt-2 text-[16px] font-semibold text-[#244665]">
          {text(card.properties.name, "服务办理流程")}
        </h3>
        <ProgressiveText
          className="mt-1.5 text-sm/6 text-[#5A6272]"
          value={text(card.properties.summary, "请选择下一步，系统会进入对应流程节点。")}
        />
      </div>
      <div className="space-y-2 px-4 py-4">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            disabled={disabled || !selectAction}
            onClick={() => {
              if (!selectAction) return;
              onAction({
                ...selectAction,
                label: branch.label,
                payload: { ...selectAction.payload, branchId: branch.id },
              });
            }}
            className="flex w-full items-center gap-3 rounded-xl bg-[#F5F6F8] px-3 py-3 text-left transition-colors hover:bg-[#EAF1FD] disabled:opacity-50"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white text-[#2E76E8]">
              <GitBranch className="size-3.5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1 text-sm font-medium text-[#16181D]">
              {branch.label}
              {branch.description ? (
                <span className="mt-0.5 block text-xs font-normal text-[#9299A6]">
                  {branch.description}
                </span>
              ) : null}
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#B9BFC9]" />
          </button>
        ))}
      </div>
    </section>
  );
}

function SopConfirmationCard({ card, disabled, onAction }: CardRendererProps) {
  const title = text(card.properties.title, "请确认");
  const description = text(card.properties.description, "请确认是否继续办理当前事项。");
  const rows = summaryRows(card.properties.rows);
  const confirmLabel = text(card.properties.confirm_label, "确认");
  const reviseLabel = text(card.properties.revise_label, "返回修改");
  const confirmAction = card.actions.find((item) => item.id === "confirm");
  const reviseAction = card.actions.find((item) => item.id === "revise");
  const actionCount = Number(Boolean(reviseAction)) + Number(Boolean(confirmAction));
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 text-[15.5px] font-semibold text-[#16181D]">
          <span className="grid size-7 place-items-center rounded-lg bg-[#EAF1FD] text-[#2E76E8]">
            <Check className="size-4" />
          </span>
          {title}
        </div>
        <ProgressiveText className="mt-2 text-sm/6 text-[#5A6272]" value={description} />
        {rows.length ? (
          <dl className="mt-3 rounded-xl bg-[#F5F6F8] px-3 py-1">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex gap-2.5 border-t border-[#E3E6EB] py-2 text-sm first:border-t-0"
              >
                <dt className="w-[66px] shrink-0 text-[#9299A6]">{row.label}</dt>
                <dd className="min-w-0 flex-1 text-[#16181D]">
                  {row.tags.map((tag) => (
                    <span
                      key={tag}
                      className="mr-1 inline-block rounded-md bg-white px-2 py-0.5 text-xs text-[#5A6272]"
                    >
                      {tag}
                    </span>
                  ))}
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {actionCount ? (
        <div
          className="grid border-t border-[#EDEEF1]"
          style={{ gridTemplateColumns: `repeat(${actionCount}, 1fr)` }}
        >
          {reviseAction ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(reviseAction)}
              className="px-3 py-3.5 text-sm text-[#5A6272] disabled:opacity-50"
            >
              {reviseLabel}
            </button>
          ) : null}
          {confirmAction ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onAction(confirmAction)}
              className="flex items-center justify-center gap-2 border-l border-[#EDEEF1] px-3 py-3.5 text-sm font-medium text-[#2E76E8] first:border-l-0 disabled:cursor-default disabled:text-[#9299A6]"
            >
              {card.submittingActionId ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {card.submittingActionId
                ? "提交中…"
                : card.actionAccepted
                  ? `${confirmLabel} · 已确认`
                  : confirmLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
  prompt: string;
}

function choiceOptions(value: unknown): ChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (typeof item === "string" && item.trim()) {
      return [{ id: String(index), label: item.trim(), prompt: item.trim() }];
    }
    const source = record(item);
    const label = text(source.label);
    if (!label) return [];
    return [
      {
        id: text(source.id, String(index)),
        label,
        description: text(source.description) || undefined,
        prompt: text(source.prompt, label),
      },
    ];
  });
}

function OptionsCard({ card, disabled, onAction }: CardRendererProps) {
  const options = choiceOptions(card.properties.items);
  return (
    <section className="rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="flex items-center text-xs text-[#9299A6]">
        {text(card.properties.eyebrow, "请选择")}
        <span className="ml-auto flex gap-1" aria-hidden="true">
          <i className="h-1.5 w-3.5 rounded-full bg-[#2E76E8]" />
          <i className="size-1.5 rounded-full bg-[#B9BFC9]" />
          <i className="size-1.5 rounded-full bg-[#B9BFC9]" />
        </span>
      </div>
      <p className="mt-2 text-[15px]/6 text-[#16181D]">
        {text(card.properties.title, "请选择一个选项")}
      </p>
      <div className="mt-3 space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction({ id: option.id, label: option.label, prompt: option.prompt })}
            className="flex w-full items-center gap-3 rounded-xl bg-[#F5F6F8] px-3 py-3 text-left transition-colors hover:bg-[#EAF1FD] disabled:opacity-50"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-white text-[#5A6272]">
              <Check className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1 text-sm text-[#16181D]">
              {option.label}
              {option.description ? (
                <span className="mt-0.5 block text-xs text-[#9299A6]">{option.description}</span>
              ) : null}
            </span>
            <ChevronRight className="size-4 shrink-0 text-[#B9BFC9]" />
          </button>
        ))}
      </div>
    </section>
  );
}

function ActionListCard({ card, disabled, onAction }: CardRendererProps) {
  const questions = choiceOptions(card.properties.items);
  const items = questions.length
    ? questions
    : card.actions.map((action) => ({
        id: action.id,
        label: action.label,
        prompt: action.prompt ?? action.label,
      }));
  return (
    <section className="rounded-2xl bg-white px-4 pb-1 pt-3.5 shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <h3 className="text-[13px] text-[#9299A6]">
        {text(card.properties.title, "您可能还想了解")}
      </h3>
      <div className="mt-1 divide-y divide-[#EDEEF1]">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={disabled}
            onClick={() => onAction({ id: item.id, label: item.label, prompt: item.prompt })}
            className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-[#2E76E8] disabled:opacity-50"
          >
            <span>{item.label}</span>
            <ChevronRight className="size-4 shrink-0 text-[#B9BFC9]" />
          </button>
        ))}
      </div>
    </section>
  );
}

function ChoiceCard(props: CardRendererProps) {
  const variant = text(props.card.properties.variant, "options");
  if (variant === "options") return <OptionsCard {...props} />;
  if (variant === "action-list") return <ActionListCard {...props} />;
  return <UnknownCard {...props} />;
}

function updateItems(value: unknown): Array<{ kind: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim()) return [{ kind: "", text: item.trim() }];
    const source = record(item);
    const itemText = text(source.text);
    return itemText ? [{ kind: text(source.label), text: itemText }] : [];
  });
}

function FeatureListCard({ card, disabled, onAction }: CardRendererProps) {
  const items = updateItems(card.properties.items);
  const actions = card.actions.slice(0, 2);
  const Icon = cardIcon(card.properties.icon, "download");
  return (
    <section className="overflow-hidden rounded-2xl border-l-4 border-[#C8AA6A] bg-white shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="border-b border-[#EDEEF1] px-4 py-4">
        <h3 className="flex items-center gap-2 font-semibold text-[#244665]">
          <Icon className="size-5 text-[#AD9158]" />
          {text(card.properties.title, "详情")}
        </h3>
        <p className="mt-1 text-xs text-[#AA8C50]">{text(card.properties.subtitle)}</p>
      </div>
      <ul className="space-y-3 px-4 py-4">
        {items.map((item, index) => (
          <li
            key={`${item.kind}-${index}`}
            className="flex items-start gap-2.5 text-sm/6 text-[#5A6272]"
          >
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#EAF1FD] text-[#7892B3]">
              <Check className="size-3" />
            </span>
            <span>
              {item.kind ? (
                <b className="mr-1 font-semibold text-[#244665]">{item.kind}：</b>
              ) : null}
              {item.text}
            </span>
          </li>
        ))}
      </ul>
      {actions.length ? (
        <div
          className="grid border-t border-[#EDEEF1]"
          style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction(action)}
              className="border-l border-[#EDEEF1] px-2 py-3.5 text-sm text-[#2E76E8] first:border-l-0 disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EntityCard({ card, disabled, onAction }: CardRendererProps) {
  const action = card.actions[0];
  const Icon = cardIcon(card.properties.icon, "file");
  return (
    <section className="flex items-center gap-3 rounded-2xl border border-[#EDEEF1]/70 bg-white px-4 py-3.5 shadow-[0_4px_16px_rgba(22,24,29,0.025)]">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#F5F6F8] text-[#5A6272]">
        <Icon className="size-5" strokeWidth={1.6} />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-[15.5px] font-semibold tracking-[-0.01em]">
          {text(card.properties.title, "信息")}
        </strong>
        <span className="mt-0.5 block truncate text-xs text-[#9299A6]">
          {text(card.properties.subtitle)}
        </span>
      </span>
      {action ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onAction(action)}
          className="shrink-0 rounded-full bg-[#EAF1FD] px-3 py-1.5 text-[13px] text-[#2E76E8] disabled:opacity-50"
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
}

interface SummaryRow {
  label: string;
  value: string;
  tags: string[];
}

function summaryRows(value: unknown): SummaryRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    const label = text(source.label);
    const rowValue = text(source.value);
    const tags = Array.isArray(source.tags)
      ? source.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim()))
      : [];
    return label && (rowValue || tags.length) ? [{ label, value: rowValue, tags }] : [];
  });
}

function KeyValueCard({ card }: CardRendererProps) {
  const rows = summaryRows(card.properties.rows);
  const Icon = cardIcon(card.properties.icon, "file");
  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <h3 className="mb-2.5 flex items-center gap-2 text-[15px] font-semibold">
        <Icon className="size-[17px] text-[#2E76E8]" strokeWidth={1.8} />
        {text(card.properties.title, "详情")}
      </h3>
      <dl>
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex gap-2.5 border-t border-[#EDEEF1] py-2 text-sm first:border-t-0"
          >
            <dt className="w-[66px] shrink-0 text-[#9299A6]">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-[#16181D]">
              {row.tags.map((tag) => (
                <span
                  key={tag}
                  className="mr-1 inline-block rounded-md bg-[#F5F6F8] px-2 py-0.5 text-xs text-[#5A6272]"
                >
                  {tag}
                </span>
              ))}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ContentCard(props: CardRendererProps) {
  const variant = text(props.card.properties.variant);
  if (variant === "feature-list") return <FeatureListCard {...props} />;
  if (variant === "entity") return <EntityCard {...props} />;
  if (variant === "key-value") return <KeyValueCard {...props} />;
  return <UnknownCard {...props} />;
}

function StatusCard({ card, disabled, onAction }: CardRendererProps) {
  const state = text(card.properties.state, "progress");
  const Icon = cardIcon(
    card.properties.icon,
    state === "active" ? "headphones" : state === "progress" ? "clock" : "check",
  );
  if (state === "active") {
    return (
      <section className="rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-xl bg-[#EAF7F1] text-[#1FA971]">
            <Icon className="size-[18px]" strokeWidth={1.8} />
          </span>
          <span>
            <strong className="block text-[15px]">
              {text(card.properties.title, "状态已更新")}
            </strong>
            <span className="text-xs text-[#9299A6]">
              {text(card.properties.subtitle, "处理中")}
            </span>
          </span>
        </div>
      </section>
    );
  }
  if (["cancelled", "completed"].includes(state)) {
    return (
      <section className="rounded-2xl bg-white p-4 text-sm text-[#5A6272] shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
        <p className="flex items-center gap-2 font-medium text-[#16181D]">
          <Icon className="size-5 text-[#1FA971]" />
          {text(card.properties.title, state === "completed" ? "已完成" : "已取消")}
        </p>
        <p className="mt-1 text-xs text-[#9299A6]">
          {text(card.properties.subtitle, "状态已更新")}
        </p>
      </section>
    );
  }

  const metric = record(card.properties.metric);
  const metricValue =
    typeof metric.value === "number" && Number.isFinite(metric.value)
      ? String(metric.value)
      : text(metric.value, "0");
  const actions = card.actions.slice(0, 2);
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-xl bg-[#EAF1FD] text-[#2E76E8]">
          <Icon className="size-[18px]" strokeWidth={1.8} />
        </span>
        <span>
          <strong className="block text-[15px]">{text(card.properties.title, "处理中")}</strong>
          <span className="text-xs text-[#9299A6]">{text(card.properties.subtitle)}</span>
        </span>
      </div>
      <div className="mx-4 flex items-baseline gap-1 rounded-xl bg-[#F5F6F8] px-3.5 py-3">
        <b className="text-[28px]/none font-semibold text-[#2E76E8]">{metricValue}</b>
        <span className="text-[13px] text-[#9299A6]">{text(metric.label)}</span>
        <em className="ml-auto text-xs not-italic text-[#9299A6]">{text(metric.hint)}</em>
      </div>
      <p className="px-4 py-3.5 text-sm/6 text-[#5A6272]">
        {text(card.properties.description, "请稍候，状态变化后会自动更新。")}
      </p>
      {actions.length ? (
        <div
          className="grid border-t border-[#EDEEF1]"
          style={{ gridTemplateColumns: `repeat(${actions.length}, 1fr)` }}
        >
          {actions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              disabled={disabled}
              onClick={() => onAction(action)}
              className={`px-2 py-3.5 text-sm disabled:opacity-50 ${
                index ? "border-l border-[#EDEEF1] font-medium text-[#2E76E8]" : "text-[#5A6272]"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ServiceRatingCard({ card, disabled, onAction }: CardRendererProps) {
  const [solved, setSolved] = useState<boolean | null>(null);
  const [rating, setRating] = useState(0);
  const submitAction = card.actions.find((action) => action.id === "submit");
  if (card.properties.submitted) {
    return (
      <section className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-[#5A6272] shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
        <CircleCheck className="mx-auto mb-2 size-7 text-[#1FA971]" strokeWidth={1.7} />
        感谢您的评价 · 已提交
      </section>
    );
  }
  return (
    <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <h3 className="text-[15px] font-semibold">
        {text(card.properties.question, "您对本次人工服务满意吗？")}
      </h3>
      <p className="mb-4 mt-1 text-xs text-[#9299A6]">
        {text(card.properties.subtitle, "人工客服 · 会话已结束")}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="w-[60px] text-[13px] text-[#5A6272]">
          {text(card.properties.binary_label, "是否解决")}
        </span>
        {[true, false].map((value) => (
          <button
            key={String(value)}
            type="button"
            disabled={disabled}
            aria-pressed={solved === value}
            onClick={() => setSolved(value)}
            className={`flex min-h-7 items-center gap-1.5 text-[13px] ${
              solved === value ? "text-[#2E76E8]" : "text-[#5A6272]"
            }`}
          >
            <i
              className={`grid size-[17px] place-items-center rounded-full border-[1.5px] ${
                solved === value
                  ? "border-[#2E76E8] bg-[#2E76E8] after:size-[5px] after:rounded-full after:bg-white after:content-['']"
                  : "border-[#B9BFC9]"
              }`}
            />
            {value
              ? text(card.properties.positive_label, "是")
              : text(card.properties.negative_label, "否")}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2.5">
        <span className="w-[60px] shrink-0 text-[13px] text-[#5A6272]">
          {text(card.properties.rating_label, "评分")}
        </span>
        <span className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              disabled={disabled}
              aria-label={`${value}星`}
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className={value <= rating ? "text-[#F5A623]" : "text-[#DDE0E5]"}
            >
              <Star className="size-[22px]" fill="currentColor" strokeWidth={1.5} />
            </button>
          ))}
        </span>
      </div>
      <button
        type="button"
        disabled={disabled || !submitAction || solved === null || !rating}
        onClick={() => {
          if (!submitAction) return;
          onAction({
            ...submitAction,
            payload: { ...submitAction.payload, positive: solved, rating },
          });
        }}
        className="mt-4 w-full rounded-[10px] bg-[#2E76E8] px-3 py-2.5 text-sm font-medium text-white disabled:bg-[#F5F6F8] disabled:text-[#B9BFC9]"
      >
        {text(card.properties.submit_label, "提交")}
      </button>
    </section>
  );
}

function UnknownCard({ card }: CardRendererProps) {
  return (
    <section className="rounded-2xl bg-white p-4 text-sm text-[#5A6272] shadow-[0_4px_16px_rgba(22,24,29,0.035)]">
      <p className="flex items-center gap-2 font-medium text-[#16181D]">
        <CircleAlert className="size-4 text-[#D97706]" />
        暂不支持此卡片
      </p>
      <p className="mt-1 text-xs text-[#9299A6]">
        {card.component}@{card.componentVersion}
      </p>
    </section>
  );
}

const IM_CARD_RENDERERS: Record<ImCardComponentKey, CardRenderer> = {
  [IM_CARD_COMPONENTS.qa]: QaCard,
  [IM_CARD_COMPONENTS.sopFirstTurn]: SopFirstTurnCard,
  [IM_CARD_COMPONENTS.sopConfirmation]: SopConfirmationCard,
  [IM_CARD_COMPONENTS.serviceRating]: ServiceRatingCard,
  [IM_CARD_COMPONENTS.choice]: ChoiceCard,
  [IM_CARD_COMPONENTS.content]: ContentCard,
  [IM_CARD_COMPONENTS.status]: StatusCard,
};

export function ImCardRenderer(props: CardRendererProps) {
  const Renderer = props.card.contract ? IM_CARD_RENDERERS[props.card.contract] : UnknownCard;
  return <Renderer {...props} />;
}

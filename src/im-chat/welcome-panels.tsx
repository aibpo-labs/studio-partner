import {
  Bot,
  BookOpenText,
  Headset,
  Cable,
  ChevronRight,
  ClipboardList,
  Coffee,
  GraduationCap,
  HeartPulse,
  KeyRound,
  RefreshCw,
  Ticket,
  TrainFront,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { ImPresentation } from "./presentation";

interface WelcomePanelsProps {
  presentation: ImPresentation;
  disabled: boolean;
  onPrompt: (prompt: string) => void;
  featuredCard?: ReactNode;
}

export function WelcomePanels({
  presentation,
  disabled,
  onPrompt,
  featuredCard,
}: WelcomePanelsProps) {
  const { questionGroups, quickPrompts, greeting } = presentation;
  const icons = [ClipboardList, Wrench, Ticket, BookOpenText, Headset];
  const namedIcons: Record<string, typeof Ticket> = { ticket: Ticket, guide: BookOpenText, travel: TrainFront, wifi: Cable, shopping: Coffee, eligibility: KeyRound };
  const quickEntries = quickPrompts.map((prompt, index) => ({
    ...prompt,
    icon: namedIcons[prompt.icon || ''] || icons[index] || Ticket,
  }));
  const groups = Object.keys(questionGroups);
  const [group, setGroup] = useState(groups[0]);
  const [batch, setBatch] = useState(0);
  const activeGroup = questionGroups[group] ? group : groups[0];
  const batches = questionGroups[activeGroup] || [];
  const questions = batches.length ? batches[batch % batches.length] : [];

  return (
    <>
      <div className="grid grid-cols-5 gap-2" aria-label="快捷入口">
        {quickEntries.map(({ label, prompt, icon: Icon }) => (
          <button
            key={label}
            type="button"
            disabled={disabled}
            onClick={() => onPrompt(prompt)}
            className="flex min-w-0 flex-col items-center gap-2 rounded-[14px] bg-white px-1 py-3 text-[11px] text-[#5A6272] shadow-[0_4px_16px_rgba(22,24,29,0.025)] transition-transform active:scale-95 disabled:opacity-50"
          >
            <Icon className="size-5 text-[#2E76E8]" strokeWidth={1.7} />
            <span className="truncate">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-[9px]">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-[#EDF3FD] to-[#E1EBFA] text-[#3E6FBF]">
          <Bot className="size-5" strokeWidth={1.7} />
        </span>
        <p className="max-w-[calc(100%-45px)] rounded-[18px] rounded-tl-lg bg-white px-3.5 py-2.5 text-[15.5px]/[1.62] text-[#16181D]">
          {greeting}
        </p>
      </div>

      {featuredCard}

      {groups.length > 0 && <section className="rounded-2xl border border-[#EDEEF1]/70 bg-white px-4 pb-1 pt-4 shadow-[0_4px_16px_rgba(22,24,29,0.025)]">
        <div className="flex items-center justify-between">
          <h2 className="text-[15.5px] font-semibold text-[#16181D]">猜你想问</h2>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setBatch((value) => value + 1)}
            className="flex items-center gap-1 text-xs text-[#9299A6] disabled:opacity-50"
          >
            <RefreshCw className="size-3.5" />
            换一批
          </button>
        </div>
        <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {groups.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setGroup(name);
                setBatch(0);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs ${
                name === activeGroup ? "bg-[#16181D] text-white" : "bg-[#F5F6F8] text-[#5A6272]"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="mt-1 divide-y divide-[#EDEEF1]">
          {questions.map((question) => (
            <button
              key={question.prompt}
              type="button"
              disabled={disabled}
              onClick={() => onPrompt(question.prompt)}
              className="flex w-full items-center gap-2 py-3 text-left text-sm text-[#16181D] disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">{question.label}</span>
              {question.hot ? (
                <span className="rounded bg-[#FDEDE8] px-1.5 py-0.5 text-[9px] font-bold text-[#E0603A]">
                  热
                </span>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-[#B9BFC9]" />
            </button>
          ))}
        </div>
      </section>}
    </>
  );
}

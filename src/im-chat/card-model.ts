import type { TextTurnEvent } from "./types";
import {
  imCardComponentKey,
  type ImCardAction,
  type ImCardActionStyle,
  type ImCardComponentKey,
  type ImCardPropertiesByComponent,
} from "./card-contracts";

export type { ImCardAction } from "./card-contracts";

export interface ImCardModel {
  cardId: string;
  turnId: string;
  sequence: number;
  component: string;
  componentVersion: string;
  contract: ImCardComponentKey | null;
  status: string;
  properties: Record<string, unknown>;
  actions: ImCardAction[];
  actionAccepted: boolean;
  submittingActionId: string | null;
}

export type TypedImCardModel<K extends ImCardComponentKey> = Omit<
  ImCardModel,
  "contract" | "properties"
> & {
  contract: K;
  properties: ImCardPropertiesByComponent[K] & Record<string, unknown>;
};

export function isImCardContract<K extends ImCardComponentKey>(
  card: ImCardModel,
  contract: K,
): card is TypedImCardModel<K> {
  return card.contract === contract;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function actionList(value: unknown): ImCardAction[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = record(item);
    const id = text(source.id);
    const label = text(source.label);
    if (!id || !label) return [];
    const style = text(source.style);
    const payload = record(source.payload);
    return [
      {
        id,
        label,
        prompt: text(source.prompt) || undefined,
        style: (["primary", "secondary", "danger", "link"] as const).includes(
          style as ImCardActionStyle,
        )
          ? (style as ImCardActionStyle)
          : undefined,
        payload: Object.keys(payload).length ? payload : undefined,
      },
    ];
  });
}

export function imCardFromEvent(event: TextTurnEvent): ImCardModel | null {
  const metadata = event.metadata ?? {};
  const cardId = text(metadata.cardId);
  if (!cardId) return null;
  const component = text(metadata.component, "unknown-card");
  const componentVersion = text(metadata.componentVersion, "1.0");
  return {
    cardId,
    turnId: event.turnId,
    sequence: event.sequence,
    component,
    componentVersion,
    contract: imCardComponentKey(component, componentVersion),
    status: text(event.status, "AWAITING_USER_ACTION"),
    properties: record(metadata.properties),
    actions: actionList(metadata.actions),
    actionAccepted: false,
    submittingActionId: null,
  };
}

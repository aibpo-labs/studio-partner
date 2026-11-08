export const IM_CARD_COMPONENTS = {
  qa: "qa-card@1.0",
  sopFirstTurn: "sop-first-turn-card@1.0",
  sopConfirmation: "sop-confirmation-card@1.0",
  serviceRating: "service-rating-card@1.0",
  choice: "choice-card@1.0",
  content: "content-card@1.0",
  status: "status-card@1.0",
} as const;

export type ImCardComponentKey = (typeof IM_CARD_COMPONENTS)[keyof typeof IM_CARD_COMPONENTS];
export type ImCardCategory = "content" | "choice" | "status" | "feedback";
export type ImCardActionStyle = "primary" | "secondary" | "danger" | "link";
export type ImCardIcon = "car" | "check" | "clock" | "download" | "file" | "headphones";

// Complete business cards, each rendered as one versioned contract.
export const POC_IM_CARD_COMPONENTS = [
  IM_CARD_COMPONENTS.qa,
  IM_CARD_COMPONENTS.sopFirstTurn,
  IM_CARD_COMPONENTS.sopConfirmation,
  IM_CARD_COMPONENTS.serviceRating,
] as const;

export const POC_IM_CARD_ACTION_IDS = {
  [IM_CARD_COMPONENTS.qa]: [],
  [IM_CARD_COMPONENTS.sopFirstTurn]: ["select"],
  [IM_CARD_COMPONENTS.sopConfirmation]: ["revise", "confirm"],
  [IM_CARD_COMPONENTS.serviceRating]: ["submit"],
} as const;

export interface ImCardAction {
  id: string;
  label: string;
  prompt?: string;
  style?: ImCardActionStyle;
  payload?: Record<string, unknown>;
}

export interface ChoiceCardItem {
  id: string;
  label: string;
  description?: string;
  prompt?: string;
  payload?: Record<string, unknown>;
}

export interface QaRelatedQuestion {
  id: string;
  label: string;
  prompt?: string;
}

export interface QaCardProperties {
  question?: string;
  answer?: string;
  answer_label?: string;
  related_questions?: QaRelatedQuestion[];
}

export interface SopBranchItem {
  id: string;
  label: string;
  description?: string;
}

export interface SopFirstTurnCardProperties {
  eyebrow?: string;
  name?: string;
  summary?: string;
  branches?: SopBranchItem[];
}

export interface KeyValueRow {
  label: string;
  value?: string;
  tags?: string[];
}

export interface SopConfirmationCardProperties {
  title?: string;
  description?: string;
  rows?: KeyValueRow[];
  confirm_label?: string;
  revise_label?: string;
}

export interface ServiceRatingCardProperties {
  question?: string;
  subtitle?: string;
  binary_label?: string;
  positive_label?: string;
  negative_label?: string;
  rating_label?: string;
  submit_label?: string;
  submitted?: boolean;
}

export type ChoiceCardProperties =
  | {
      variant: "options";
      eyebrow?: string;
      title?: string;
      items?: ChoiceCardItem[];
    }
  | {
      variant: "action-list";
      title?: string;
      items?: ChoiceCardItem[];
    };

export interface FeatureListItem {
  label?: string;
  text: string;
}

export type ContentCardProperties =
  | {
      variant: "feature-list";
      icon?: ImCardIcon;
      title?: string;
      subtitle?: string;
      items?: Array<string | FeatureListItem>;
    }
  | {
      variant: "entity";
      icon?: ImCardIcon;
      placement?: "welcome" | "timeline";
      title?: string;
      subtitle?: string;
    }
  | {
      variant: "key-value";
      icon?: ImCardIcon;
      title?: string;
      rows?: KeyValueRow[];
    };

export type StatusCardState = "progress" | "active" | "cancelled" | "completed";

export interface StatusCardProperties {
  context?: string;
  state: StatusCardState;
  icon?: ImCardIcon;
  title?: string;
  subtitle?: string;
  description?: string;
  metric?: {
    value: string | number;
    label: string;
    hint?: string;
  };
}

// Source compatibility for code that imported the original generic names.
export type ConfirmationCardProperties = SopConfirmationCardProperties;
export type RatingCardProperties = ServiceRatingCardProperties;

export interface ImCardPropertiesByComponent {
  [IM_CARD_COMPONENTS.qa]: QaCardProperties;
  [IM_CARD_COMPONENTS.sopFirstTurn]: SopFirstTurnCardProperties;
  [IM_CARD_COMPONENTS.sopConfirmation]: SopConfirmationCardProperties;
  [IM_CARD_COMPONENTS.serviceRating]: ServiceRatingCardProperties;
  [IM_CARD_COMPONENTS.choice]: ChoiceCardProperties;
  [IM_CARD_COMPONENTS.content]: ContentCardProperties;
  [IM_CARD_COMPONENTS.status]: StatusCardProperties;
}

export interface ImCardDefinition<K extends ImCardComponentKey = ImCardComponentKey> {
  contract: K;
  category: ImCardCategory;
  interaction: "none" | "prompt" | "action" | "mixed";
  variants?: readonly string[];
}

export const IM_CARD_DEFINITIONS = {
  [IM_CARD_COMPONENTS.qa]: {
    contract: IM_CARD_COMPONENTS.qa,
    category: "content",
    interaction: "prompt",
  },
  [IM_CARD_COMPONENTS.sopFirstTurn]: {
    contract: IM_CARD_COMPONENTS.sopFirstTurn,
    category: "choice",
    interaction: "action",
  },
  [IM_CARD_COMPONENTS.sopConfirmation]: {
    contract: IM_CARD_COMPONENTS.sopConfirmation,
    category: "choice",
    interaction: "mixed",
  },
  [IM_CARD_COMPONENTS.serviceRating]: {
    contract: IM_CARD_COMPONENTS.serviceRating,
    category: "feedback",
    interaction: "action",
  },
  [IM_CARD_COMPONENTS.choice]: {
    contract: IM_CARD_COMPONENTS.choice,
    category: "choice",
    interaction: "prompt",
    variants: ["options", "action-list"],
  },
  [IM_CARD_COMPONENTS.content]: {
    contract: IM_CARD_COMPONENTS.content,
    category: "content",
    interaction: "mixed",
    variants: ["feature-list", "entity", "key-value"],
  },
  [IM_CARD_COMPONENTS.status]: {
    contract: IM_CARD_COMPONENTS.status,
    category: "status",
    interaction: "mixed",
  },
} satisfies { [K in ImCardComponentKey]: ImCardDefinition<K> };

// Normalize legacy component aliases when reading saved event streams.
export const IM_CARD_LEGACY_ALIASES = {
  "confirmation-card@1.0": IM_CARD_COMPONENTS.sopConfirmation,
  "rating-card@1.0": IM_CARD_COMPONENTS.serviceRating,
} as const satisfies Record<string, ImCardComponentKey>;

export const supportedImCardComponents = Object.keys(IM_CARD_DEFINITIONS) as ImCardComponentKey[];

export function imCardComponentKey(
  component: string,
  componentVersion: string,
): ImCardComponentKey | null {
  const key = `${component}@${componentVersion}`;
  if (Object.hasOwn(IM_CARD_DEFINITIONS, key)) return key as ImCardComponentKey;
  return IM_CARD_LEGACY_ALIASES[key as keyof typeof IM_CARD_LEGACY_ALIASES] ?? null;
}

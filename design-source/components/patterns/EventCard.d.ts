/**
 * EasyGame Event Card — the schedule unit: glass panel, module stripe, left time rail, title + pill, meta, actions.
 */
export interface EventMeta {
  /** Ionicons name, 15px. */
  icon: string;
  text: string;
  color?: string;
}
export interface EventCardProps {
  /** Start time, e.g. "18:00" — set large and tabular in the time rail. */
  time: string;
  endTime?: string;
  /** Short tracked date over the time, e.g. "Mer 18" — omit inside a "today" section. */
  dateLabel?: string;
  title: string;
  /** Status Pill label (category) and variant. */
  pill?: string;
  pillVariant?: "default" | "primary" | "success" | "warning" | "destructive" | "match" | "onDark";
  /** Module stripe: --eg-grad-action for trainings, --eg-grad-match for matches. */
  stripe?: string;
  meta?: EventMeta[];
  /** Status line with a glowing dot, e.g. "Allenamento attivo". Red when `cancelled`. */
  status?: string;
  cancelled?: boolean;
  /** Buttons for the action row. */
  actions?: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function EventCard(props: EventCardProps): JSX.Element;

/**
 * Dashboard module block — glass panel with module stripe, icon chip, big count, preview rows and one action.
 */
export interface HighlightItem {
  /** Leading tabular time, e.g. "18:00". */
  time?: string;
  title: string;
  meta?: string;
}
export interface HighlightCardProps {
  title: string;
  eyebrow?: string;
  count?: number;
  /** Ionicons name for the chip. */
  icon?: string;
  /** Hex module colour (chip tint, count, times). */
  color?: string;
  /** Gradient for the top stripe; defaults to `color`. */
  stripe?: string;
  items?: HighlightItem[];
  emptyLabel?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}
export declare function HighlightCard(props: HighlightCardProps): JSX.Element;

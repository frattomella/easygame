/** 16px outline icon + 14px secondary text — the metadata line inside every schedule card. */
export interface MetaRowProps {
  /** Ionicons name: location-outline, people-outline, time-outline, play-circle-outline. */
  icon: string;
  children?: React.ReactNode;
  /** Icon colour — use --eg-success / --eg-destructive to carry status. */
  color?: string;
  style?: React.CSSProperties;
}
export declare function MetaRow(props: MetaRowProps): JSX.Element;

/** Centred empty screen: 180px illustration, h4 title, secondary message, one action. */
export interface EmptyStateProps {
  /** Path to one of the four illustrations in assets/illustrations/. */
  illustration?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: React.CSSProperties;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;

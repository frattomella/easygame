/** EasyGame Status Pill — ring-dot + tracked uppercase label on a tinted, hairline-bordered pill. */
export interface BadgeProps {
  label: string;
  variant?: "default" | "primary" | "success" | "warning" | "destructive" | "match" | "onDark";
  small?: boolean;
  /** Show the leading ring-dot (default true). */
  dot?: boolean;
  /** Fill the ring. Defaults to filled for every variant except `default` (hollow = neutral/taxonomy). */
  filled?: boolean;
  style?: React.CSSProperties;
}
export declare function Badge(props: BadgeProps): JSX.Element;

/** EasyGame Icon Chip — an Ionicons glyph on a small tinted, hairline-bordered tile with the cut corner. */
export interface IconChipProps {
  /** Ionicons name. */
  name: string;
  /** Hex colour — drives glyph, tint (12%) and border (25%) in `tint` tone. */
  color?: string;
  size?: number;
  /** tint (default) · glass = frosted white · dark = translucent white on the navy sky. */
  tone?: "tint" | "glass" | "dark";
  style?: React.CSSProperties;
}
export declare function IconChip(props: IconChipProps): JSX.Element;

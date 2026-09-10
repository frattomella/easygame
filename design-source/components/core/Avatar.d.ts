/** Circular athlete / club / coach avatar. Falls back to initials on royal blue. */
export interface AvatarProps {
  src?: string | null;
  /** Used for the initials fallback and the image alt text. */
  name?: string;
  /** Diameter in px. 42 in list rows, 48 in rosters, 74 on the profile hero. */
  size?: number;
  number?: number;
  /** Shows the jersey number — as the fallback glyph, or as a corner badge over a photo. */
  showNumber?: boolean;
  style?: React.CSSProperties;
}
export declare function Avatar(props: AvatarProps): JSX.Element;

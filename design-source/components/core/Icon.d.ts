/** Ionicons glyph wrapper — the app's only icon set. Intentional addition (the RN app uses Ionicons directly). */
export interface IconProps {
  /** Ionicons name, e.g. "people-outline", "checkmark-circle", "football". */
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;

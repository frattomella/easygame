/** Typography primitive — the ramp plus two signature styles: `eyebrow` (tracked caps label) and `numeral` (tight tabular time/number). */
export interface TextProps {
  children?: React.ReactNode;
  type?: "display" | "h1" | "h2" | "h3" | "h4" | "body" | "small" | "caption" | "eyebrow" | "numeral";
  tone?: "primary" | "secondary" | "faint" | "link" | "onBrand" | "onBrandMuted" | "onBrandFaint";
  weight?: number | string;
  as?: string;
  style?: React.CSSProperties;
}
export declare function Text(props: TextProps): JSX.Element;

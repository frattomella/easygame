/** Brand gradient surface — #2563EB → #1D4ED8 → #1E3A8A at 135°, plus a slate scrim. */
export interface BrandGradientProps {
  /** Corner radius in px; 9999 for the pill tab bar. */
  radius?: number;
  /** Scrim opacity: 0.04 app bars, 0.08 tab bar, 0.10 transparent headers. */
  overlayOpacity?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function BrandGradient(props: BrandGradientProps): JSX.Element;

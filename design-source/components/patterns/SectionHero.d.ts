/**
 * Sky headline block — eyebrow, display title, supporting line and glass stat chips, set in the navy zone.
 */
export interface HeroStat {
  value: string | number;
  label: string;
}
export interface SectionHeroProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Ionicons name for a 44px dark icon chip on the left. */
  icon?: string;
  iconColor?: string;
  /** Up to three glass chips, e.g. { value: 2, label: "oggi" }. */
  stats?: HeroStat[];
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function SectionHero(props: SectionHeroProps): JSX.Element;

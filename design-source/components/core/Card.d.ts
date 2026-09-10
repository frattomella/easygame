/**
 * EasyGame glass panel — frosted surface, signature cut corner, inner highlight, layered shadow.
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Small tracked uppercase label above the title. */
  eyebrow?: string;
  title?: string;
  description?: string;
  /** CSS colour or gradient painted as a 3px stripe along the top edge (module identity). */
  stripe?: string;
  /** glass (default) · dark = navy glass for the sky zone · solid = opaque white for dense lists. */
  tone?: "glass" | "dark" | "solid";
  noPadding?: boolean;
  elevated?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Card(props: CardProps): JSX.Element;

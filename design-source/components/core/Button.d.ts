/**
 * EasyGame Action Surface — gradient fill with inner highlight and glow, signature cut corner.
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** primary = action gradient. secondary = frosted glass. onDark = translucent white for the navy sky zone. */
  variant?: "primary" | "secondary" | "outline" | "destructive" | "success" | "ghost" | "onDark";
  /** sm 40px · md 52px · lg 60px */
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Leading Ionicons name. */
  icon?: string;
  /** Trailing Ionicons name rendered inside a small highlight chip — the signature CTA form. */
  trailingIcon?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;

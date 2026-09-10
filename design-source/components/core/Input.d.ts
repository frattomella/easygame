/**
 * 48px text field: label above, 1.5px border that turns royal blue on focus, error text below.
 * @startingPoint section="Core" subtitle="Text field with label, icons and error state" viewport="700x260"
 */
export interface InputProps {
  label?: string;
  error?: string;
  value?: string;
  placeholder?: string;
  /** Ionicons name, e.g. "search-outline". */
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;

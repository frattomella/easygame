/** Fixed gap on the 4px scale, for the rare case where flex `gap` is not available. */
export interface SpacerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  horizontal?: boolean;
}
export declare function Spacer(props: SpacerProps): JSX.Element;

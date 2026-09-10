/**
 * EasyGame Athlete Row — number tile, name, role · state, trailing ring toggle; the whole row is the tap target.
 */
export interface SelectableAthleteRowProps {
  name: string;
  number?: number | string;
  /** Position, e.g. "Portiere". */
  role?: string;
  selected?: boolean;
  /** Presente / Convocato. */
  selectedLabel?: string;
  /** Assente / Non convocato. */
  unselectedLabel?: string;
  /** success = attendance (green) · primary = call-ups (blue). */
  accent?: "success" | "primary";
  disabled?: boolean;
  onToggle?: () => void;
  style?: React.CSSProperties;
}
export declare function SelectableAthleteRow(props: SelectableAthleteRowProps): JSX.Element;

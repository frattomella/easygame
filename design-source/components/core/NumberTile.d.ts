/** EasyGame Number Tile — jersey number on a gradient tile with the signature cut corner. */
export interface NumberTileProps {
  number: number | string;
  /** Side in px: 44 in rows, 56 in detail headers. */
  size?: number;
  /** navy = resting · action = selected/called-up · success = present · match = match context · muted = disabled. */
  tone?: "navy" | "action" | "success" | "match" | "muted";
  /** Tiny tracked caption under the number, e.g. "POR" for goalkeeper. */
  label?: string;
  style?: React.CSSProperties;
}
export declare function NumberTile(props: NumberTileProps): JSX.Element;

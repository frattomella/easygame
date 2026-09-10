/** Counter tile — glass, cut corner, icon chip, 28px tabular number, tracked caps label. */
export interface StatCardProps {
  label: string;
  value: string | number;
  /** Ionicons name. */
  icon: string;
  /** Hex module colour. */
  color?: string;
  style?: React.CSSProperties;
}
export declare function StatCard(props: StatCardProps): JSX.Element;

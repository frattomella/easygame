/**
 * EasyGame Floating Dock — dark glass pill; the active tab is a raised action-gradient puck with icon + label.
 */
export interface TabBarItem {
  key: string;
  label: string;
  /** Filled Ionicons name (home, fitness, football, people, person); the outline variant is used when inactive. */
  icon: string;
}
export interface TabBarProps {
  items: TabBarItem[];
  activeKey?: string;
  onChange?: (key: string) => void;
  style?: React.CSSProperties;
}
export declare function TabBar(props: TabBarProps): JSX.Element;

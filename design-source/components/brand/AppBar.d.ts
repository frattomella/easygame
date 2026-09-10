/** Screen header in the navy sky: tracked eyebrow + 26px/800 display title, glass icon chips on the right. */
export interface AppBarProps {
  title: string;
  /** Tracked caps line above the title: club name, date, section. */
  eyebrow?: string;
  notificationCount?: number;
  onNotifications?: () => void;
  right?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function AppBar(props: AppBarProps): JSX.Element;

/** EasyGame layered screen background — navy sky with floodlight pools and pitch lines over a light ground. */
export interface FloodlightProps {
  /** Height in px of the navy zone; content glass panels overlap its lower edge. Default 300. */
  skyHeight?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Floodlight(props: FloodlightProps): JSX.Element;

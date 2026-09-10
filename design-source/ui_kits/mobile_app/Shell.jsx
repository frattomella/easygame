(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const AppBar = lazyDS("AppBar"), TabBar = lazyDS("TabBar"), Text = lazyDS("Text"), Button = lazyDS("Button"), Icon = lazyDS("Icon"), Floodlight = lazyDS("Floodlight");

const TABS = [
  { key: "home", label: "Home", icon: "home" },
  { key: "trainings", label: "Allenamenti", icon: "fitness" },
  { key: "matches", label: "Gare", icon: "football" },
  { key: "athletes", label: "Atleti", icon: "people" },
  { key: "profile", label: "Profilo", icon: "person" },
];

const phoneShellStyles = {
  frame: { width: 390, height: 844, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", fontFamily: "var(--eg-font-brand)" },
  statusBar: { height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", color: "#fff", fontFamily: "var(--eg-font-brand)", fontSize: 13, fontWeight: 700, flex: "0 0 auto" },
  scroll: { flex: 1, overflowY: "auto", padding: "12px 16px 124px" },
  tabWrap: { position: "absolute", left: 20, right: 20, bottom: 18 },
  sheetOverlay: { position: "absolute", inset: 0, background: "rgba(7,18,43,0.55)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-end", zIndex: 20 },
  sheet: { background: "var(--eg-glass-bg-strong)", backdropFilter: "var(--eg-glass-blur)", border: "1px solid var(--eg-glass-border)", borderBottom: "none", borderRadius: "28px 28px 0 0", padding: "12px 20px 24px", width: "100%", maxHeight: "86%", display: "flex", flexDirection: "column", boxShadow: "var(--eg-highlight-top), var(--eg-shadow-glass-raised)" },
  grabber: { width: 40, height: 4, borderRadius: 2, background: "rgba(11,26,58,0.18)", margin: "0 auto 14px" },
  sheetActions: { display: "flex", gap: 10, marginTop: 16 },
};

function StatusBar() {
  return (
    <div style={phoneShellStyles.statusBar}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Icon name="cellular" size={14} color="#fff" /><Icon name="wifi" size={14} color="#fff" /><Icon name="battery-full" size={16} color="#fff" />
      </span>
    </div>
  );
}

function Phone({ children, skyHeight = 300 }) {
  return <Floodlight skyHeight={skyHeight} style={phoneShellStyles.frame}><div style={{ display: "flex", flexDirection: "column", height: 844 }}><StatusBar />{children}</div></Floodlight>;
}

function AppScreen({ title, eyebrow, notifications = 0, tab, onTab, children, onNotifications, skyHeight = 300, hero }) {
  return (
    <Phone skyHeight={skyHeight}>
      <AppBar title={title} eyebrow={eyebrow} notificationCount={notifications} onNotifications={onNotifications} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="eg-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none" }}>
          {hero}
          <div style={{ padding: "12px 16px 124px" }}>{children}</div>
        </div>
      </div>
      <div style={phoneShellStyles.tabWrap}><TabBar items={TABS} activeKey={tab} onChange={onTab} /></div>
    </Phone>
  );
}

function Sheet({ eyebrow, title, children, onClose, onConfirm, confirmLabel, confirmVariant = "primary" }) {
  return (
    <div style={phoneShellStyles.sheetOverlay} onClick={onClose}>
      <div style={phoneShellStyles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={phoneShellStyles.grabber} />
        {eyebrow ? <Text type="eyebrow" tone="faint">{eyebrow}</Text> : null}
        <Text type="h3" style={{ marginTop: 2, marginBottom: 12 }}>{title}</Text>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", margin: "0 -4px", padding: "0 4px" }}>{children}</div>
        <div style={phoneShellStyles.sheetActions}>
          <Button variant="secondary" onClick={onClose} style={{ flex: "0 0 auto" }}>Annulla</Button>
          <Button variant={confirmVariant} onClick={onConfirm} fullWidth trailingIcon="arrow-forward" style={{ flex: 1 }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, count, onDark = false }) {
  const tone = onDark ? "onBrandMuted" : "faint";
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "14px 4px 10px" }}>
      <Text type="eyebrow" tone={tone}>{children}</Text>
      {count !== undefined ? <Text type="caption" tone={tone} weight={700}>{count}</Text> : null}
    </div>
  );
}

Object.assign(window, { Phone, AppScreen, Sheet, SectionTitle, TABS, phoneShellStyles });
})();

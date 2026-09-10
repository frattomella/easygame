(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Text = lazyDS("Text"), Input = lazyDS("Input"), Button = lazyDS("Button"), Icon = lazyDS("Icon"), Card = lazyDS("Card");

function LoginScreen({ onLogin }) {
  const [email, setEmail] = React.useState("andrea.ferrari@asroma.it");
  const [password, setPassword] = React.useState("••••••••");
  const [showServer, setShowServer] = React.useState(false);
  return (
    <window.Phone skyHeight={420}>
      <div style={{ flex: 1, overflowY: "auto", padding: "56px 20px 24px", display: "flex", flexDirection: "column" }}>
        <Text type="eyebrow" tone="onBrandMuted">EasyGame · Allenatori</Text>
        <Text type="h1" tone="onBrand" style={{ marginTop: 6, fontSize: 36, lineHeight: "40px" }}>Bentornato,<br />Coach.</Text>
        <Text type="body" tone="onBrandMuted" style={{ marginTop: 10, maxWidth: 280 }}>Presenze e convocazioni della tua squadra, in un tocco.</Text>
        <Card elevated style={{ marginTop: 40, padding: 20 }}>
          <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} leftIcon="mail-outline" />
          <Input label="Password" value={password} type="password" onChange={(e) => setPassword(e.target.value)} leftIcon="lock-closed-outline" rightIcon="eye-outline" onRightIconPress={() => {}} style={{ marginBottom: 20 }} />
          <Button fullWidth size="lg" trailingIcon="arrow-forward" onClick={onLogin}>Accedi</Button>
          <button type="button" onClick={() => setShowServer(!showServer)} style={{ background: "none", border: "none", padding: "16px 0 0", color: "var(--eg-text-link)", font: "600 13px/18px var(--eg-font-brand)", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, margin: "0 auto" }}>
            <Icon name={showServer ? "chevron-up-outline" : "chevron-down-outline"} size={16} color="var(--eg-text-link)" />
            Configurazione Server
          </button>
          {showServer ? <div style={{ marginTop: 14 }}><Input label="URL server" value="https://staging.easygame.app" onChange={() => {}} leftIcon="server-outline" style={{ marginBottom: 0 }} /></div> : null}
        </Card>
        <div style={{ marginTop: "auto", textAlign: "center", paddingTop: 24 }}>
          <Text type="caption" tone="faint">Versione 1.0.0 · MVP Allenatori</Text>
        </div>
      </div>
    </window.Phone>
  );
}

Object.assign(window, { LoginScreen });
})();

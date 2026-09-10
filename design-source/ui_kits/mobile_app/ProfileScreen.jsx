(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Card = lazyDS("Card"), Text = lazyDS("Text"), Badge = lazyDS("Badge"), Button = lazyDS("Button"), Input = lazyDS("Input"), Avatar = lazyDS("Avatar"), IconChip = lazyDS("IconChip"), Icon = lazyDS("Icon"), SectionHero = lazyDS("SectionHero");

function ProfileScreen({ tab, onTab, onLogout }) {
  const d = window.EG_DATA;
  const permissions = [["Presenze", true], ["Convocazioni", true], ["Scheda tecnica", true], ["Pagamenti", false]];
  const hero = (
    <div style={{ padding: "18px 20px 8px", display: "flex", alignItems: "center", gap: 16 }}>
      <Avatar name={d.coach.name} size={72} style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.22), var(--eg-glow-primary)", borderRadius: "50%" }} />
      <div style={{ minWidth: 0 }}>
        <Text type="eyebrow" tone="onBrandMuted">{d.coach.role}</Text>
        <Text type="h3" tone="onBrand" style={{ marginTop: 2 }}>{d.coach.name}</Text>
        <Text type="small" tone="onBrandMuted">{d.coach.club}</Text>
      </div>
    </div>
  );
  return (
    <window.AppScreen title="Profilo" eyebrow="Account EasyGame" tab={tab} onTab={onTab} notifications={3} onNotifications={() => {}} hero={hero} skyHeight={300}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card eyebrow="Dati personali">
          <Input label="Nome e cognome" value={d.coach.name} onChange={() => {}} />
          <Input label="Email" value="andrea.ferrari@asroma.it" onChange={() => {}} />
          <Input label="Telefono" value="+39 340 118 22 07" onChange={() => {}} style={{ marginBottom: 20 }} />
          <Button fullWidth trailingIcon="arrow-forward" onClick={() => {}}>Salva modifiche</Button>
        </Card>
        <Card eyebrow="Club attivo">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar src="../../assets/avatars/default_club_avatar.png" name={d.coach.club} size={44} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text type="body" weight={700}>{d.coach.club}</Text>
              <Text type="caption" tone="faint" weight={500}>{d.coach.role} · 2 categorie</Text>
            </div>
            <Button size="sm" variant="secondary">Cambia</Button>
          </div>
        </Card>
        <Card eyebrow="Permessi">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {permissions.map(([label, on]) => <Badge key={label} label={label} variant={on ? "success" : "default"} small />)}
          </div>
        </Card>
        <Card eyebrow="Impostazioni" noPadding style={{ padding: "16px 16px 4px" }}>
          {[["notifications-outline", "Notifiche", "#2563eb"], ["shield-outline", "Privacy", "#3533cd"], ["help-circle-outline", "Aiuto", "#10b981"]].map(([icon, label, color], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 56, borderTop: i ? "1px solid var(--eg-hairline)" : "none" }}>
              <IconChip name={icon} color={color} size={34} />
              <Text type="body" weight={600} style={{ flex: 1, fontSize: 15 }}>{label}</Text>
              <Icon name="chevron-forward-outline" size={16} color="var(--eg-ink-faint)" />
            </div>
          ))}
        </Card>
        <Button fullWidth variant="destructive" icon="log-out-outline" onClick={onLogout}>Esci</Button>
        <Text type="caption" tone="faint" style={{ textAlign: "center", marginTop: 4 }}>EasyGame Mobile · versione 1.0.0</Text>
      </div>
    </window.AppScreen>
  );
}

Object.assign(window, { ProfileScreen });
})();

(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Card = lazyDS("Card"), Text = lazyDS("Text"), Badge = lazyDS("Badge"), Input = lazyDS("Input"), NumberTile = lazyDS("NumberTile"), Icon = lazyDS("Icon"), SectionHero = lazyDS("SectionHero");

const STATUS = { attivo: ["Attivo", "success"], infortunato: ["Infortunato", "warning"], squalificato: ["Squalificato", "destructive"] };
const ABBR = { Portiere: "POR", Difensore: "DIF", Centrocampista: "CEN", Attaccante: "ATT", Ala: "ALA", Trequartista: "TRQ" };

function AthletesScreen({ tab, onTab }) {
  const d = window.EG_DATA;
  const [query, setQuery] = React.useState("");
  const list = d.athletes.filter((a) => [a.name, a.category, a.position, a.number].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const active = d.athletes.filter((a) => a.status === "attivo").length;
  const hero = (
    <SectionHero eyebrow="Rosa squadra" icon="people" title="I tuoi atleti"
      stats={[{ value: d.athletes.length, label: "in rosa" }, { value: active, label: "disponibili" }]}>
      <div style={{ marginTop: 16 }}>
        <Input placeholder="Cerca atleta, categoria o numero..." value={query} onChange={(e) => setQuery(e.target.value)}
          leftIcon="search-outline" rightIcon={query ? "close-circle" : undefined} onRightIconPress={() => setQuery("")} style={{ marginBottom: 0 }} />
      </div>
    </SectionHero>
  );
  return (
    <window.AppScreen title="Atleti" eyebrow={d.coach.club} tab={tab} onTab={onTab} notifications={3} onNotifications={() => {}} hero={hero} skyHeight={360}>
      <div style={{ display: "flex", gap: 8, padding: "2px 4px 12px" }}>
        {d.categories.map((c) => <Badge key={c.id} label={c.name} variant="onDark" small />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {list.length ? list.map((a) => {
          const [label, variant] = STATUS[a.status];
          return (
            <Card key={a.id} onClick={() => {}} style={{ padding: "10px 12px 10px 10px", borderRadius: "var(--eg-corner-sm)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <NumberTile number={a.number} size={48} label={ABBR[a.position]} tone={a.status === "attivo" ? "navy" : "muted"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text type="body" weight={700} style={{ fontSize: 15, lineHeight: "20px" }}>{a.name}</Text>
                  <Text type="caption" tone="faint" weight={500} style={{ marginTop: 2 }}>{a.category} · {a.position}</Text>
                </div>
                <Badge label={label} variant={variant} small />
                <Icon name="chevron-forward-outline" size={16} color="var(--eg-ink-faint)" />
              </div>
            </Card>
          );
        }) : (
          <Card><Text type="body" weight={700} style={{ marginBottom: 4 }}>Nessun atleta trovato</Text><Text type="small" tone="secondary">Prova a cambiare ricerca.</Text></Card>
        )}
      </div>
    </window.AppScreen>
  );
}

Object.assign(window, { AthletesScreen });
})();

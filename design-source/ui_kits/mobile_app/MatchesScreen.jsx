(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Card = lazyDS("Card"), Text = lazyDS("Text"), Button = lazyDS("Button"), EventCard = lazyDS("EventCard"), SectionHero = lazyDS("SectionHero"), SelectableAthleteRow = lazyDS("SelectableAthleteRow");

function MatchesScreen({ tab, onTab }) {
  const d = window.EG_DATA;
  const [matches, setMatches] = React.useState(d.matches);
  const [sheet, setSheet] = React.useState(null);
  const [draft, setDraft] = React.useState([]);

  const openConvocations = (match) => {
    setDraft(d.athletes.filter((a) => a.category === match.category).map((a, i) => ({ ...a, selected: match.convoked > 0 && i < 2 })));
    setSheet(match);
  };
  const save = () => {
    const convoked = draft.filter((e) => e.selected).length;
    setMatches((list) => list.map((m) => (m.id === sheet.id ? { ...m, convoked } : m)));
    setSheet(null);
  };

  const groups = [
    { key: "today", title: "Gare di oggi", empty: "Nessuna gara registrata per oggi." },
    { key: "week", title: "Gare della settimana", empty: "Nessuna gara ulteriore in settimana." },
  ];
  const todayCount = matches.filter((m) => m.when === "today").length;
  const weekCount = matches.filter((m) => m.when === "week").length;
  const selectedCount = draft.filter((e) => e.selected).length;

  const hero = (
    <SectionHero eyebrow="Gare in evidenza" icon="football" iconColor="#fb923c"
      title={todayCount > 0 ? `${todayCount} gara oggi` : "Nessuna gara oggi"}
      subtitle="In alto la giornata corrente, sotto la programmazione settimanale in ordine cronologico."
      stats={[{ value: todayCount, label: "oggi" }, { value: weekCount, label: "settimana" }]} />
  );

  return (
    <>
      <window.AppScreen title="Gare" eyebrow={d.coach.club} tab={tab} onTab={onTab} notifications={3} onNotifications={() => {}} hero={hero} skyHeight={340}>
        {groups.map((g) => {
          const items = matches.filter((m) => m.when === g.key);
          return (
            <div key={g.key}>
              <window.SectionTitle count={items.length} onDark={g.key === "today"}>{g.title}</window.SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {items.length ? items.map((m) => (
                  <EventCard key={m.id} time={m.time} dateLabel={g.key === "today" ? undefined : m.date.slice(0, 6)} title={`vs ${m.opponent}`} pill={m.category} pillVariant="match"
                    stripe="var(--eg-grad-match)"
                    meta={[{ icon: "location-outline", text: m.location }, { icon: "people-outline", text: `${m.convoked} convocati` }]}
                    actions={<Button size="sm" icon="people" onClick={() => openConvocations(m)}>Convocazioni</Button>} />
                )) : <Card><Text type="small" tone="secondary">{g.empty}</Text></Card>}
              </div>
            </div>
          );
        })}
      </window.AppScreen>
      {sheet ? (
        <window.Sheet eyebrow={`vs ${sheet.opponent} · ${sheet.category}`} title="Convocazioni" onClose={() => setSheet(null)} onConfirm={save} confirmLabel={`Convoca ${selectedCount}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.map((e) => (
              <SelectableAthleteRow key={e.id} name={e.name} number={e.number} role={e.position} selected={e.selected} accent="primary" disabled={e.status !== "attivo"}
                selectedLabel="Convocato" unselectedLabel="Non convocato"
                onToggle={() => setDraft((list) => list.map((x) => (x.id === e.id ? { ...x, selected: !x.selected } : x)))} />
            ))}
          </div>
        </window.Sheet>
      ) : null}
    </>
  );
}

Object.assign(window, { MatchesScreen });
})();

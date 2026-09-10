(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Card = lazyDS("Card"), Text = lazyDS("Text"), Button = lazyDS("Button"), EventCard = lazyDS("EventCard"), SectionHero = lazyDS("SectionHero"), SelectableAthleteRow = lazyDS("SelectableAthleteRow");

function TrainingsScreen({ tab, onTab }) {
  const d = window.EG_DATA;
  const [trainings, setTrainings] = React.useState(d.trainings);
  const [sheet, setSheet] = React.useState(null);
  const [draft, setDraft] = React.useState([]);

  const groups = [
    { key: "today", title: "Allenamenti di oggi", empty: "Nessun allenamento nella giornata corrente." },
    { key: "week", title: "Questa settimana", empty: "Nessun altro allenamento entro fine settimana." },
    { key: "future", title: "Calendario successivo", empty: "Nessun allenamento nelle settimane successive." },
  ];

  const openAttendance = (training) => {
    setDraft(d.athletes.filter((a) => a.category === training.category).map((a, i) => ({ ...a, present: i < training.present })));
    setSheet(training);
  };
  const toggleStatus = (training) => setTrainings((list) => list.map((t) => (t.id === training.id ? { ...t, status: t.status === "cancelled" ? "scheduled" : "cancelled" } : t)));
  const save = () => {
    const present = draft.filter((e) => e.present).length;
    setTrainings((list) => list.map((t) => (t.id === sheet.id ? { ...t, present, total: draft.length } : t)));
    setSheet(null);
  };

  const todayCount = trainings.filter((t) => t.when === "today").length;
  const weekCount = trainings.filter((t) => t.when === "week").length;
  const presentCount = draft.filter((e) => e.present).length;

  const renderCard = (t, g) => {
    const cancelled = t.status === "cancelled";
    const [start, end] = t.time.split(" - ");
    return (
      <EventCard key={t.id} time={start} endTime={end} dateLabel={g.key === "today" ? undefined : t.date.slice(0, 6)} title={t.title} pill={t.category}
        stripe="var(--eg-grad-action)" cancelled={cancelled}
        meta={[{ icon: "location-outline", text: t.location }, { icon: "people-outline", text: `${t.present}/${t.total} presenti` }]}
        status={cancelled ? "Allenamento annullato" : "Allenamento attivo"}
        actions={<>
          {!cancelled ? <Button size="sm" icon="checkmark-circle" onClick={() => openAttendance(t)}>Presenze</Button> : null}
          <Button size="sm" variant="secondary" onClick={() => toggleStatus(t)}>{cancelled ? "Ripristina" : "Annulla"}</Button>
        </>} />
    );
  };

  const hero = (
    <SectionHero eyebrow="Programma di oggi" icon="fitness"
      title={todayCount > 0 ? `${todayCount} allenamenti` : "Nessun allenamento"}
      subtitle="Allenamenti del giorno in alto, poi la settimana corrente e il calendario successivo."
      stats={[{ value: todayCount, label: "oggi" }, { value: weekCount, label: "settimana" }]} />
  );

  return (
    <>
      <window.AppScreen title="Allenamenti" eyebrow={d.coach.club} tab={tab} onTab={onTab} notifications={3} onNotifications={() => {}} hero={hero} skyHeight={340}>
        {groups.map((g) => {
          const items = trainings.filter((t) => t.when === g.key);
          return (
            <div key={g.key}>
              <window.SectionTitle count={items.length} onDark={g.key === "today"}>{g.title}</window.SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {items.length ? items.map((t) => renderCard(t, g)) : <Card><Text type="small" tone="secondary">{g.empty}</Text></Card>}
              </div>
            </div>
          );
        })}
      </window.AppScreen>
      {sheet ? (
        <window.Sheet eyebrow={`${sheet.title} · ${sheet.time}`} title="Presenze" onClose={() => setSheet(null)} onConfirm={save} confirmLabel={`Salva ${presentCount}/${draft.length}`} confirmVariant="success">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {draft.map((e) => (
              <SelectableAthleteRow key={e.id} name={e.name} number={e.number} role={e.position} selected={e.present} disabled={e.status !== "attivo"}
                onToggle={() => setDraft((list) => list.map((x) => (x.id === e.id ? { ...x, present: !x.present } : x)))} />
            ))}
          </div>
        </window.Sheet>
      ) : null}
    </>
  );
}

Object.assign(window, { TrainingsScreen });
})();

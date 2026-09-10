(function(){
const lazyDS = (name) => function DSComponent(props){ var C = (window.EasyGameDesignSystem_845326||{})[name]; return C ? React.createElement(C, props) : null; };
const Text = lazyDS("Text"), HighlightCard = lazyDS("HighlightCard"), StatCard = lazyDS("StatCard"), Badge = lazyDS("Badge"), SectionHero = lazyDS("SectionHero");

function HomeScreen({ tab, onTab, onGo }) {
  const d = window.EG_DATA;
  const todayTrainings = d.trainings.filter((t) => t.when === "today");
  const todayMatches = d.matches.filter((m) => m.when === "today");
  const hero = (
    <SectionHero eyebrow="Mercoledì 18 marzo" title="Buongiorno, Andrea" subtitle={`${d.coach.club} · ${d.coach.role}`}
      stats={[{ value: todayTrainings.length, label: "allenamenti" }, { value: todayMatches.length, label: "gara" }, { value: d.tasks.length, label: "promemoria" }]} />
  );
  return (
    <window.AppScreen title="Dashboard" eyebrow="EasyGame" notifications={3} tab={tab} onTab={onTab} onNotifications={() => {}} hero={hero} skyHeight={330}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <HighlightCard eyebrow="Oggi" title="Allenamenti" count={todayTrainings.length} icon="fitness" color="#2563eb" stripe="var(--eg-grad-action)"
          items={todayTrainings.slice(0, 2).map((t) => ({ time: t.time.split(" - ")[0], title: t.title, meta: t.location }))}
          emptyLabel="Nessun allenamento programmato per oggi." actionLabel="Vai agli Allenamenti" onAction={() => onGo("trainings")} />
        <HighlightCard eyebrow="Oggi" title="Gare" count={todayMatches.length} icon="football" color="#f97316" stripe="var(--eg-grad-match)"
          items={todayMatches.slice(0, 2).map((m) => ({ time: m.time, title: `vs ${m.opponent}`, meta: m.location }))}
          emptyLabel="Nessuna gara oggi." actionLabel="Vai alle Gare" onAction={() => onGo("matches")} />
        <HighlightCard eyebrow="In sospeso" title="Promemoria" count={d.tasks.length} icon="notifications-outline" color="#10b981" stripe="var(--eg-grad-success)"
          items={d.tasks.slice(0, 2).map((k) => ({ title: k.title, meta: k.due }))}
          emptyLabel="Nessun promemoria in sospeso." actionLabel="Apri Profilo" onAction={() => onGo("profile")} />
      </div>
      <window.SectionTitle>Riepilogo stagione</window.SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <StatCard label="Atleti seguiti" value={d.athletes.length} icon="people-outline" color="#2563eb" />
        <StatCard label="Allenamenti" value={d.trainings.length} icon="barbell-outline" color="#10b981" />
      </div>
    </window.AppScreen>
  );
}

Object.assign(window, { HomeScreen });
})();

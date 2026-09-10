(function(){
function App() {
  const [signedIn, setSignedIn] = React.useState(false);
  const [tab, setTab] = React.useState("home");
  if (!signedIn) return <window.LoginScreen onLogin={() => setSignedIn(true)} />;
  const props = { tab, onTab: setTab };
  if (tab === "trainings") return <window.TrainingsScreen {...props} />;
  if (tab === "matches") return <window.MatchesScreen {...props} />;
  if (tab === "athletes") return <window.AthletesScreen {...props} />;
  if (tab === "profile") return <window.ProfileScreen {...props} onLogout={() => { setSignedIn(false); setTab("home"); }} />;
  return <window.HomeScreen {...props} onGo={setTab} />;
}

// Screen files and the design-system bundle may finish loading in any order
// (they are blob-inlined in the standalone export), so wait for all of them.
(function boot() {
  const ready = window.EasyGameDesignSystem_845326 && window.EasyGameDesignSystem_845326.Button && window.EG_DATA &&
    ["LoginScreen", "HomeScreen", "TrainingsScreen", "MatchesScreen", "AthletesScreen", "ProfileScreen"].every((k) => window[k]);
  if (!ready) return void setTimeout(boot, 30);
  if (!window.__egRoot) window.__egRoot = ReactDOM.createRoot(document.getElementById("root"));
  window.__egRoot.render(<App />);
})();
})();

The EasyGame **Floating Dock**. Dark navy glass, 68px, pill-shaped, floating 20px from the edges with a deep shadow and a 1px inner highlight. Only the active tab has a label — it sits inside a glowing action-gradient puck; the rest are outline glyphs at 55% white.

```jsx
<TabBar activeKey="trainings" onChange={setTab} items={[
  { key: "home", label: "Home", icon: "home" },
  { key: "trainings", label: "Allenamenti", icon: "fitness" },
  { key: "matches", label: "Gare", icon: "football" },
  { key: "athletes", label: "Atleti", icon: "people" },
  { key: "profile", label: "Profilo", icon: "person" },
]} />
```

Reserve ~104px of bottom padding under scrolling content.

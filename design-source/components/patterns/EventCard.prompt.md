The EasyGame **Event Card** — how every training and match appears. Its tell is the left time rail: a big 22px/800 tabular start time with the end time beneath, separated from the content by a hairline, under a 3px module stripe on the top edge.

```jsx
<EventCard time="18:00" endTime="19:30" title="Allenamento Portieri" pill="Under 15"
  stripe="var(--eg-grad-action)"
  meta={[{ icon: "location-outline", text: "Palestra Comunale" }, { icon: "people-outline", text: "14/18 presenti" }]}
  status="Allenamento attivo"
  actions={<><Button size="sm">Presenze</Button><Button size="sm" variant="secondary">Annulla</Button></>} />
<EventCard time="15:30" title="vs Virtus Nord" pill="Gara" pillVariant="match" stripe="var(--eg-grad-match)" … />
```

`cancelled` turns the border dashed, strikes the time and greys the stripe. Pressed = scale 0.985.

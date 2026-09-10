The dashboard's module blocks. No solid colour slabs — each module is a glass panel identified by its stripe, chip and big count.

```jsx
<HighlightCard eyebrow="Oggi" title="Allenamenti" count={2} icon="fitness" color="#2563eb" stripe="var(--eg-grad-action)"
  items={[{ time: "18:00", title: "Allenamento Portieri", meta: "Palestra Comunale" }]}
  emptyLabel="Nessun allenamento programmato per oggi." actionLabel="Vai agli Allenamenti" onAction={go} />
```

Modules: trainings `#2563eb` / `--eg-grad-action`, matches `#f97316` / `--eg-grad-match`, reminders `#10b981` / `--eg-grad-success`.

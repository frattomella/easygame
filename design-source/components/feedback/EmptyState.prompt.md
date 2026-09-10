Full-screen empty state. Only for a genuinely empty list — a section with no items inside a populated screen uses a plain Card with one secondary line ("Nessun allenamento nella giornata corrente.").

```jsx
<EmptyState illustration="assets/illustrations/empty_trainings_illustration.png" title="Nessun allenamento" message="Non ci sono sessioni programmate questa settimana." actionLabel="Aggiorna" onAction={reload} />
```

Illustrations available: tasks, trainings, matches, athletes. Note they carry baked-in English labels — see the readme caveat.

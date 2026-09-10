The EasyGame **Athlete Row** — the core of attendance and call-ups. One tap toggles the row; the state is told by the number tile (navy → green/blue gradient), the ring (hollow → filled with check + halo), the border tint and the word.

```jsx
<SelectableAthleteRow name="Marco Rossi" number={9} role="Attaccante" selected onToggle={toggle} />
<SelectableAthleteRow name="Luca Bianchi" number={4} role="Difensore" accent="primary" selectedLabel="Convocato" unselectedLabel="Non convocato" onToggle={toggle} />
```

64px tall, 8px apart. `disabled` mutes the tile and blocks the tap (injured / suspended athletes).

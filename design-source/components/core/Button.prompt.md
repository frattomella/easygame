The EasyGame **Action Surface**. One `primary` per card or sheet — a blue→indigo gradient with a 1px inner highlight and a soft blue glow; the main CTA of a sheet also gets `trailingIcon="arrow-forward"` so the arrow sits in its own highlight chip.

```jsx
<Button fullWidth size="lg" trailingIcon="arrow-forward">Salva presenze</Button>
<Button variant="secondary" size="sm">Annulla</Button>
<Button variant="onDark" size="sm" icon="calendar-outline">Vai agli Allenamenti</Button>
```

States: pressed = scale 0.97 + 1px drop + brightness; disabled = 6% ink fill, no gradient, no glow; loading = spinner replaces label. `success` is for confirming attendance, `destructive` only for Esci / delete.

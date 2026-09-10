The EasyGame glass panel. Every content block sits on it: frosted white at 74% with an 18px blur, a 1px translucent border, a 1px inner top highlight and a soft navy shadow — and the signature corner (three 22px corners, bottom-right cut to 8px).

```jsx
<Card eyebrow="Rosa" title="I tuoi atleti">…</Card>
<Card stripe="var(--eg-grad-action)" onClick={open}>…</Card>
<Card tone="dark">…</Card>   // navy glass, for the sky zone at the top of a screen
```

Stack panels 12px apart on the layered background; the blur shows the floodlight orbs through them. Pressed = scale 0.985 + slight brighten.

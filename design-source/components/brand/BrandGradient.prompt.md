The one gradient in the system. Use it for chrome (app bar, tab bar, login header) — never as a page background behind body copy.

```jsx
<BrandGradient overlayOpacity={0.04} style={{ padding: "var(--eg-space-lg)" }}>…</BrandGradient>
<BrandGradient radius={9999} overlayOpacity={0.08}>…</BrandGradient>
```

Flat `--eg-primary` (not the gradient) is correct for hero cards inside screen content.

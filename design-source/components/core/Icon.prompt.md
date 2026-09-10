Renders an Ionicons glyph — the same set the app ships — as a masked SVG, so it inherits any colour and needs no extra script on the page.

```jsx
<Icon name="location-outline" size={16} color="var(--eg-text-secondary)" />
<Icon name="checkmark-circle" size={24} color="var(--eg-success)" />
```

Metadata rows use 16px outline glyphs in `--eg-text-secondary`; selection affordances use 24px filled glyphs in the state colour; tab bar uses 24px filled glyphs in white. Names are Ionicons names. The 28 glyphs the product uses are vendored in `assets/icons/` — point `window.EG_ICON_BASE` at that folder (relative to your page) before rendering, e.g. `window.EG_ICON_BASE = "../../assets/icons/"`. Without it the component falls back to the Ionicons CDN.

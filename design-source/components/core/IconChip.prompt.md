Icons in EasyGame are never bare unless they are 16px metadata glyphs beside text. Anything larger sits in an Icon Chip so it reads as part of the surface system.

```jsx
<IconChip name="barbell-outline" color="#2563eb" />
<IconChip name="notifications-outline" tone="dark" size={40} />
```

Pass a hex `color`; the chip derives its tint and border from it.

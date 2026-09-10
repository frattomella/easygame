Identity glyph for athletes, clubs and the signed-in coach. There are almost no photos in the product, so the initials fallback is the normal case.

```jsx
<Avatar name="Marco Rossi" size={48} showNumber number={9} />
<Avatar src={club.logo} name={club.name} size={40} />
```

Sizes in use: 40–42 (list rows), 48 (roster), 74 (profile hero). `assets/avatars/` holds the default athlete and club placeholders.

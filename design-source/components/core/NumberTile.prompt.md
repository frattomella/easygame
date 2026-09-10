The athlete identity glyph in EasyGame is the **jersey number**, not a face or initials. The tile carries selection state through its tone: navy at rest, action-gradient when called up, green when present.

```jsx
<NumberTile number={9} />
<NumberTile number={9} tone="success" />
<NumberTile number={1} label="POR" size={56} />
```

Use `Avatar` only for clubs and the signed-in coach (people without a number).

Single text field pattern used across Login, search and the profile form. Labels are sentence case Italian ("Nome e cognome"), placeholders describe the action ("Cerca atleta, categoria o numero...").

```jsx
<Input label="Email" value={email} onChange={e => setEmail(e.target.value)} />
<Input placeholder="Cerca atleta…" leftIcon="search-outline" rightIcon="close-circle" onRightIconPress={clear} />
```

Errors are short and specific: "Credenziali non valide", "Le password non coincidono".

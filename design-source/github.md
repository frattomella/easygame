repo: frattomella/easygame
branch: main
path: easygamemobile

## Last sync

design-system-revision: EGDS v2.1.0

date: 2026-09-10

### Updated in this project

- v2.1.0: formalised the three components the implementation pass created (`StateMessage`, `SecondaryScreenLayout`, `SignatureInput`) from `easygamemobile/client/components/signature/**`.
- Wrote normative specs for the six unported Trainer components and ten new Parent-area components.
- Defined the mobile navigation language for both Trainer and Parent, plus child-switcher placement.
- Added the Trainer reskin plan for Home / Allenamenti / Gare / Atleti.

Note: read via the attached local codebase mount (`easygame/`), not via the GitHub API, so no commit sha is recorded. Sources read this pass: `docs/knowledge-base/05-mobile-architecture.md`, `easygamemobile/client/components/signature/{StateMessage,SecondaryScreenLayout,SignatureInput}.tsx`, and `src/components/parent-dashboard/**` for the Parent domain's Italian status vocabulary only — the web dashboard's visual design was neither consulted nor changed.

## Screen map

| Project screen | Repo files |
| --- | --- |
| `ui_kits/mobile_app/LoginScreen.jsx` | `easygamemobile/client/screens/LoginScreen.tsx` |
| `ui_kits/mobile_app/HomeScreen.jsx` | `easygamemobile/client/screens/TrainerHomeDashboardScreen.tsx` |
| `ui_kits/mobile_app/TrainingsScreen.jsx` | `easygamemobile/client/screens/TrainerTrainingsScreen.tsx` |
| `ui_kits/mobile_app/MatchesScreen.jsx` | `easygamemobile/client/screens/TrainerMatchesScreen.tsx` |
| `ui_kits/mobile_app/AthletesScreen.jsx` | `easygamemobile/client/screens/TrainerAthletesScreen.tsx` |
| `ui_kits/mobile_app/ProfileScreen.jsx` | `easygamemobile/client/screens/TrainerProfileDashboardScreen.tsx` |
| `ui_kits/mobile_app/Shell.jsx` | `easygamemobile/client/navigation/MainTabNavigator.tsx`, `client/hooks/useScreenOptions.ts` |
| `components/core/*`, `components/feedback/*`, `components/brand/BrandGradient.jsx` | `easygamemobile/client/components/*.tsx` |
| `tokens/*.css` | `easygamemobile/client/constants/theme.ts`, `design_guidelines.md` |
| `guidelines/component-specs.md` (Part A) | `easygamemobile/client/components/signature/{StateMessage,SecondaryScreenLayout,SignatureInput}.tsx` |
| `guidelines/component-specs.md` (Part C) | `src/components/parent-dashboard/parent-dashboard-{pages,types}.tsx` — status vocabulary only |
| `guidelines/navigation.md` | `easygamemobile/client/navigation/**`, `src/components/parent-dashboard/ParentSidebar.tsx` |
| `guidelines/trainer-migration.md` | `easygamemobile/client/screens/Trainer{Home,Trainings,Matches,Athletes}*.tsx` |

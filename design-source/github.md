repo: frattomella/easygame
branch: main
path: easygamemobile

## Last sync

date: 2026-09-09

### Updated in this project

- Built the token layer from `easygamemobile/client/constants/theme.ts` (colours, spacing, radii, type ramp, shadows).
- Recreated the app's component library: Button, Badge, Card, Avatar, Input, Text, Icon, Spacer, EmptyState.
- Extracted the brand chrome (gradient app bar, floating tab bar) and the screen patterns used by the trainer screens.
- Built a click-through UI kit of the coach app: login, dashboard, attendance, call-ups, roster, profile.

Note: read via the attached local codebase mount (`easygame/`), not via the GitHub API, so no commit sha is recorded. A related mobile-only repo, `frattomella/easygame-mobile`, was listed but not read.

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

# EasyGame Mobile - Design Guidelines

## Brand Identity
**EasyGame Mobile** is a professional sports coaching app for Italian sports trainers. The aesthetic is clean, trustworthy, and efficiency-focused with a sporty edge. The royal blue primary color conveys professionalism and team spirit.

## Color Palette
- **Primary**: Royal Blue (#2563EB) - main actions, active states, headers
- **Background**: #F8FAFC - screen backgrounds
- **Foreground**: #0F172A - primary text
- **Muted**: Surface #F1F5F9, Text #64748B - secondary elements
- **Border**: #E2E8F0 - dividers and card borders
- **Success**: #22C55E - positive states
- **Warning**: #F59E0B - alerts
- **Destructive**: #EF4444 - delete/logout actions

## Typography
- **Language**: All UI text in Italian
- Use system fonts (San Francisco on iOS, Roboto on Android)
- Hierarchy: Bold for titles, Semibold for headers, Regular for body

## Visual Design
- **Cards**: 12px border-radius, subtle drop shadow
- **Icons**: Ionicons from @expo/vector-icons
- **Spacing**: Consistent 16px base unit
- **Active States**: Royal blue for selected tabs and interactive elements

## Navigation Architecture

**Root Flow**: Stack Navigator (Authentication) → Bottom Tab Navigator (Main App)

### Authentication Stack:
1. Login Screen
2. Context Selection Screen

### Main App (Bottom Tabs):
- 5 tabs: Home, Allenamenti (Trainings), Gare (Matches), Atleti (Athletes), Profilo (Profile)
- Tab bar with Ionicons, active tab in royal blue

## Screen-by-Screen Specifications

### 1. Login Screen
**Purpose**: Authenticate coaches and configure backend server

**Layout**:
- Header: Logo (soccer ball icon with royal blue background)
- Title: "EasyGame" + subtitle "App per Allenatori"
- Form fields: Email, Password
- Primary button: "Accedi" (full width)
- Expandable section: "Configurazione Server" with URL input field
- Safe area: top inset.top + 24px, bottom inset.bottom + 24px

**Components**: Input fields with labels, primary button, collapsible section

### 2. Context Selection Screen
**Purpose**: Choose club/team context to work with

**Layout**:
- Header: "Seleziona Contesto" title + logout button (right)
- Section 1: "Club Posseduti" with club cards
- Section 2: "I Miei Accessi" with access cards + "+ Aggiungi" button
- Each card: Avatar, Club name, Role badge
- Modal: Token input (5-8 digit code)
- Safe area: top headerHeight + 16px, bottom inset.bottom + 16px

**Components**: Card list, avatar, badge, modal with input

### 3. Home Screen
**Purpose**: Dashboard with today's activities and reminders

**Layout**:
- Header: "Buongiorno, [Nome]" + club avatar (right)
- Badge: Club name + categories
- Section 1: "Attività & Promemoria" with task cards
- Section 2: "Programma di Oggi" with training card showing: time, title, location, category, "Presenze" button
- Card: "Prossima Gara: vs [Avversario]"
- Scrollable view
- Safe area: top inset.top + 16px, bottom tabBarHeight + 16px

**Components**: Header with avatar, badge, task cards, training card with left blue border

### 4. Allenamenti (Trainings) Screen
**Purpose**: Weekly training calendar with attendance tracking

**Layout**:
- Header: "Calendario Allenamenti"
- Week view: 5 day selector (Mon-Fri), active day highlighted in royal blue
- List: Training sessions with title, category badge, time, date, location, attendance count
- "Registra Presenze" button per session
- Left border accent in royal blue
- Safe area: top headerHeight + 16px, bottom tabBarHeight + 16px

**Components**: Horizontal day selector, list cards with left accent border, badges

### 5. Gare (Matches) Screen
**Purpose**: Upcoming matches and past results

**Layout**:
- Header: "Gare"
- Tab switcher: "In Arrivo" / "Risultati"
- Upcoming match card: Blue header with date/time, VS section with team names, location, kit info, "Gestisci Convocazioni" button
- Result card: Date, opponent, score in gray box
- Safe area: top headerHeight + 16px, bottom tabBarHeight + 16px

**Components**: Tab switcher, match cards with colored headers, score display boxes

### 6. Atleti (Athletes) Screen
**Purpose**: Team roster with search and details

**Layout**:
- Header: "Rosa Squadra"
- Search bar
- FlatList: Athletes with avatar (jersey number), name, status badge, position, category
- Modal (detail): Large avatar, name, number, position, status, category, contacts
- Safe area: top headerHeight + 16px, bottom tabBarHeight + 16px

**Components**: Search input, list items with avatars, colored status badges, modal

### 7. Profilo (Profile) Screen
**Purpose**: User settings and logout

**Layout**:
- Header: Royal blue background with avatar, name, role
- Card: "Club" info with "Cambia" button
- Section "Impostazioni": Notifiche (toggle switch), Privacy, Aiuto
- Destructive button: "Esci" (red)
- Footer: App version number
- Safe area: top 0 (header bleeds), bottom inset.bottom + 16px

**Components**: Blue header card, settings list with toggle, destructive button

## Reusable Components Specifications

### Button
Variants: primary (royal blue), secondary, outline, destructive (red), ghost
Sizes: sm, md, lg

### Input
Label above field, error message below, border color changes on focus/error

### Card
12px border-radius, subtle shadow, optional onPress for interactivity

### Avatar
Circular, image or fallback with initials, optional jersey number display

### Badge
Rounded pill shape
Variants: default, primary (royal blue), success (green), warning (orange), destructive (red)

## Assets to Generate

1. **icon.png** - App icon: Soccer ball with royal blue accent
   - WHERE USED: Device home screen

2. **splash-icon.png** - Soccer ball logo on royal blue background
   - WHERE USED: App launch screen

3. **login-logo.png** - Soccer ball illustration for login screen
   - WHERE USED: Login screen header

4. **empty-tasks.png** - Clipboard with checkmark illustration
   - WHERE USED: Home screen when no tasks/reminders

5. **empty-trainings.png** - Whistle and calendar illustration
   - WHERE USED: Trainings screen when no sessions scheduled

6. **empty-matches.png** - Soccer field illustration
   - WHERE USED: Matches screen when no matches

7. **empty-athletes.png** - Team jersey illustration
   - WHERE USED: Athletes screen when roster is empty

8. **default-club-avatar.png** - Generic shield/badge icon
   - WHERE USED: Club avatars when no custom image

9. **default-athlete-avatar.png** - Silhouette with jersey number
   - WHERE USED: Athlete avatars when no photo
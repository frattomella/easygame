"use client";

/**
 * L'intestazione (topbar) delle pagine del club.
 *
 * Dal redesign Web V2 (EGDS v3.1.0) l'implementazione vive in
 * `src/components/web/shell/Topbar.tsx`, che accetta le stesse prop di prima
 * (`title`, `notifications`, `onMarkRead`, `clubIdentity`,
 * `mobileNavSections`…). Questo file resta perche quarantacinque pagine la
 * montano da qui.
 */
import { Topbar, type HeaderClubIdentity } from "@/components/web/shell/Topbar";
import type { NotificationItem } from "@/components/web/shell/NotificationDrawer";

export type HeaderNotification = NotificationItem;
export type { HeaderClubIdentity };

const Header = Topbar;
export default Header;

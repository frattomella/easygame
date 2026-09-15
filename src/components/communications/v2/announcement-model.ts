import { AUDIENCE_CRITERION_LABELS, type AudienceCriterionKind } from "@/lib/audience/criteria";
import type { AnnouncementShelf } from "@/components/communications/v2/communication-status";

/**
 * L'avviso in bacheca come lo manda `GET /api/v1/announcements` (Web V2).
 *
 * Modulo puro: la forma della riga, l'etichetta del pubblico e il conteggio
 * per scaffale. Niente React, niente rete.
 */
export type AnnouncementCriterion = { kind: string; values?: string[] };

export type Announcement = {
  id: string;
  title: string;
  body: string;
  status: "draft" | "published";
  publishAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  criteria: AnnouncementCriterion[];
  shelf: AnnouncementShelf;
  audienceCount: number;
  readCount: number;
};

/** «Per categoria (2)» — chi legge l'avviso, in una parola. */
export const describeAudience = (criteria: readonly AnnouncementCriterion[] | null | undefined): string => {
  if (!criteria || criteria.length === 0) return "";
  return criteria
    .map((criterion) => {
      const label = (AUDIENCE_CRITERION_LABELS as Record<string, string>)[criterion.kind as AudienceCriterionKind] || criterion.kind;
      const count = Array.isArray(criterion.values) ? criterion.values.length : 0;
      return count > 0 ? `${label} (${count})` : label;
    })
    .join(" · ");
};

/** «3/20» — quanti l'hanno aperto su quanti lo vedono; solo per un avviso pubblicato. */
export const describeReads = (announcement: Pick<Announcement, "status" | "readCount" | "audienceCount">): string | null =>
  announcement.status === "published" ? `${announcement.readCount}/${announcement.audienceCount}` : null;

export const canPublishAnnouncement = (announcement: Pick<Announcement, "status">) => announcement.status === "draft";

export const canWithdrawAnnouncement = (announcement: Pick<Announcement, "shelf">) =>
  announcement.shelf === "current" || announcement.shelf === "scheduled";

export const countByShelf = (announcements: readonly Announcement[]): Record<AnnouncementShelf, number> => {
  const counts: Record<AnnouncementShelf, number> = { draft: 0, scheduled: 0, current: 0, expired: 0 };
  for (const announcement of announcements) {
    if (announcement.shelf in counts) counts[announcement.shelf] += 1;
  }
  return counts;
};

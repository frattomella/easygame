import { sanitizeWebsiteRichHtml } from "@/lib/rich-text/sanitize";
import { getBlockDefinition } from "@/lib/website/registry";
import type { ControlDescriptor } from "@/lib/website/registry/types";
import type { WebsitePageDocument } from "@/lib/website/document/types";

/**
 * **La sanificazione del testo ricco dei blocchi**, sul server (ADR-0190 §3,
 * ADR-0200 §15).
 *
 * Il registry dichiara quali props sono `richtext`; qui ognuna passa da
 * `sanitizeWebsiteRichHtml` prima del salvataggio. Il renderer pubblico puo
 * quindi inserire quell'HTML cosi com'e: e la condizione che CLAUDE.md pone a
 * ogni `dangerouslySetInnerHTML`.
 */

const sanitizeByControls = (props: Record<string, unknown>, controls: readonly ControlDescriptor[]) => {
  const next = { ...props };
  for (const control of controls) {
    if (control.type === "richtext") {
      next[control.key] = sanitizeWebsiteRichHtml(next[control.key]);
    } else if (control.type === "list" && Array.isArray(next[control.key])) {
      next[control.key] = (next[control.key] as Array<Record<string, unknown>>).map((item) =>
        item && typeof item === "object" ? sanitizeByControls(item, control.fields) : item,
      );
    }
  }
  return next;
};

export const sanitizeDocumentRichText = (doc: WebsitePageDocument): WebsitePageDocument => ({
  ...doc,
  sections: doc.sections.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      blocks: column.blocks.map((block) => {
        const definition = getBlockDefinition(block.type);
        if (!definition) return block;
        return { ...block, props: sanitizeByControls(block.props, definition.controls) };
      }),
    })),
  })),
});

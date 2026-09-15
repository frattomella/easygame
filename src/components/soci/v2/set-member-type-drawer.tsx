"use client";

import * as React from "react";
import { Drawer, DrawerSection } from "@/components/web/overlays/Drawer";
import { Field, FieldSizeProvider, Select } from "@/components/web/forms/Field";
import { Button } from "@/components/web/primitives/Button";
import { InsetBlock } from "@/components/web/primitives/Surface";
import { IdentityCell } from "@/components/web/primitives/Identity";
import { joinMeta } from "@/lib/web/format";
import { MEMBER_TYPES } from "@/lib/member-types";
import { getMemberDisplayName, type MemberRecord } from "@/components/soci/v2/member-model";

/**
 * L'azione di massa «Tipo socio» (guideline 07 §7.7: un cassetto, mai un
 * menu che scrive al primo clic). Il tipo di socio e **uno solo**: qui si
 * sostituisce, non si aggiunge — e la V1 lo scriveva nel menu («Il tipo e
 * uno solo: sostituisce»). L'elenco dei tipi e quello di
 * `src/lib/member-types.ts`, lo stesso della scheda.
 */
export function SetMemberTypeDrawer({
  open,
  onOpenChange,
  rows,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: MemberRecord[];
  onConfirm: (type: string) => Promise<void>;
}) {
  const [type, setType] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) setType("");
  }, [open]);

  const run = async () => {
    if (!type) return;
    setBusy(true);
    try {
      await onConfirm(type);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width="default"
      eyebrow={`Azione su ${rows.length} ${rows.length === 1 ? "socio" : "soci"}`}
      title="Tipo socio"
      description="Il tipo è uno solo: sostituisce quello attuale."
      dirty={Boolean(type)}
      locked={busy}
      data-test="member-set-type-drawer"
      footer={
        <>
          <Button variant="primary" onClick={() => void run()} disabled={!type} loading={busy}>
            Imposta
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Annulla
          </Button>
        </>
      }
    >
      <FieldSizeProvider size="sm">
        <DrawerSection eyebrow="Record interessati">
          <InsetBlock className="egw-scroll max-h-[240px] overflow-y-auto p-2">
            <ul className="flex flex-col">
              {rows.map((row) => (
                <li key={row.id} className="flex h-11 items-center border-b border-egw-rule px-2 last:border-0">
                  <IdentityCell name={getMemberDisplayName(row)} round meta={joinMeta(row.type, row.membershipNumber ? `tessera ${row.membershipNumber}` : null)} />
                </li>
              ))}
            </ul>
          </InsetBlock>
        </DrawerSection>
        <DrawerSection eyebrow="Opzioni">
          <Field label="Nuovo tipo" htmlFor="member-set-type" required>
            <Select id="member-set-type" value={type} onValueChange={setType} options={MEMBER_TYPES.map((memberType) => ({ value: memberType, label: memberType }))} placeholder="Seleziona il tipo" />
          </Field>
        </DrawerSection>
        {type ? (
          <DrawerSection eyebrow="Conferma">
            <InsetBlock>
              <p className="font-brand text-[12.5px] text-egw-ink">
                <strong className="egw-num">{rows.length}</strong> {rows.length === 1 ? "socio viene impostato" : "soci vengono impostati"} come <strong>{type}</strong>. Il tipo precedente viene sostituito.
              </p>
            </InsetBlock>
          </DrawerSection>
        ) : null}
      </FieldSizeProvider>
    </Drawer>
  );
}

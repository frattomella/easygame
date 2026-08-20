"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ClubStructure } from "@/lib/structures-utils";

type StructureInfoSectionProps = {
  structure: ClubStructure;
  onChange: (structure: ClubStructure) => void;
};

export function StructureInfoSection({
  structure,
  onChange,
}: StructureInfoSectionProps) {
  const patch = (next: Partial<ClubStructure>) =>
    onChange({ ...structure, ...next });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Informazioni</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome struttura</Label>
            <Input
              value={structure.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Tipologia</Label>
            <Input
              value={structure.type || ""}
              placeholder="Es. Centro sportivo, palestra, campo"
              onChange={(event) => patch({ type: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Indirizzo</Label>
            <Input
              value={structure.address}
              onChange={(event) => patch({ address: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Citta</Label>
            <Input
              value={structure.city || ""}
              onChange={(event) => patch({ city: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Referente</Label>
            <Input
              value={structure.contactName || ""}
              onChange={(event) => patch({ contactName: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Telefono</Label>
            <Input
              value={structure.contactPhone || ""}
              onChange={(event) => patch({ contactPhone: event.target.value })}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={structure.contactEmail || ""}
              onChange={(event) => patch({ contactEmail: event.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Struttura pubblica</p>
              <Badge variant="outline">
                {structure.isPublic ? "Pubblica" : "Privata"}
              </Badge>
            </div>
            <Switch
              checked={structure.isPublic}
              onCheckedChange={(checked) => patch({ isPublic: checked })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Visibile ai tesserati</p>
              <Badge variant="outline">
                {structure.isVisibleToMembers ? "Visibile" : "Nascosta"}
              </Badge>
            </div>
            <Switch
              checked={structure.isVisibleToMembers}
              onCheckedChange={(checked) =>
                patch({ isVisibleToMembers: checked })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">Affittabile</p>
              <Badge variant="outline">
                {structure.isRentable ? "Si" : "No"}
              </Badge>
            </div>
            <Switch
              checked={structure.isRentable}
              onCheckedChange={(checked) =>
                patch({
                  isRentable: checked,
                  rent: { ...(structure.rent || {}), enabled: checked },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Note interne</Label>
          <Textarea
            rows={4}
            value={structure.notes || ""}
            onChange={(event) => patch({ notes: event.target.value })}
          />
        </div>
      </CardContent>
    </Card>
  );
}


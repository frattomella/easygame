"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { Camera, Trash2 } from "lucide-react";

/**
 * Intestazione della scheda atleta: foto, nome, categorie, due azioni.
 *
 * **Le azioni erano tre** (W6-26). La terza, «Invia Credenziali», non chiamava
 * niente: mostrava un errore, e prima ancora un messaggio verde che dichiarava
 * un invio mai avvenuto. Non e stata riparata qui perche non e un pulsante:
 * consegnare un accesso ha tre stati, una storia e quattro azioni, e vive ora
 * nella sezione «Accesso EasyGame» della scheda
 * (`src/components/athletes/profile/athlete-account-section.tsx`).
 *
 * **Perche e un componente** (WP-19, Blocco 8). Era la prima schermata di JSX
 * di `src/app/athletes/[id]/page.tsx`, che supera le 8.000 righe. Non e stata
 * estratta perche «era lunga» — e centoventi righe — ma perche e la parte
 * della pagina che **non dipende da nulla**: riceve un atleta, le sue
 * categorie e tre callback, e non sa niente di documenti, pagamenti, taglie o
 * tesseramenti. Cio che non dipende dal resto e la prima cosa che si puo
 * spostare senza rischio.
 *
 * L'estrazione **non cambia comportamento**: stesse classi, stessi testi,
 * stesso ordine dei pulsanti. Un refactor che ne approfitta per sistemare
 * anche la grafica non e piu verificabile.
 */

export type AthleteProfileHeaderCategory = {
  categoryId: string | null;
  categoryName: string;
  isPrimary: boolean;
};

export type AthleteProfileHeaderProps = {
  athlete: {
    name?: string | null;
    surname?: string | null;
    avatar?: string | null;
  };
  categories: AthleteProfileHeaderCategory[];
  onAvatarChange: (image: string | null) => void;
  onScanDocument: () => void;
  onDelete: () => void;
};

export function AthleteProfileHeader({
  athlete,
  categories,
  onAvatarChange,
  onScanDocument,
  onDelete,
}: AthleteProfileHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex items-center gap-4">
        <AvatarUpload
          currentImage={athlete.avatar}
          onImageChange={onAvatarChange}
          name={`${athlete.name} ${athlete.surname || ""}`}
          size="xl"
          shape="square"
          type="athlete"
        />
        <div>
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold leading-tight tracking-tight text-transparent md:text-4xl">
            {athlete.name} {athlete.surname}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {categories.map((membership) => (
              <Badge
                key={`athlete-header-category-${membership.categoryId}`}
                className={
                  membership.isPrimary
                    ? "bg-blue-500 text-white"
                    : "border border-sky-200 bg-sky-50 text-sky-700"
                }
              >
                {membership.categoryName}
                {membership.isPrimary ? " • Primaria" : " • Secondaria"}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <div className="flex gap-2 w-full md:w-auto">
        <Button
          variant="outline"
          className="flex-1 md:flex-none"
          onClick={onScanDocument}
        >
          <Camera className="h-4 w-4 mr-2" />
          Scansiona documento
        </Button>
        <Button
          variant="destructive"
          className="flex-1 md:flex-none"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Elimina
        </Button>
      </div>
    </div>
  );
}

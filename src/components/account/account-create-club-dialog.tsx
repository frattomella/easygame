"use client";

import { FormEvent } from "react";
import { LogoUpload } from "@/components/ui/avatar-upload";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BadgeCheck,
  Loader2,
  Plus,
} from "lucide-react";
import {
  CLUB_TYPE_PRESETS,
  ClubCreateFormState,
  CREATE_CLUB_TABS,
  FEDERATION_PRESETS,
} from "./account-shared";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ClubCreateFormState;
  tab: (typeof CREATE_CLUB_TABS)[number]["value"];
  creating: boolean;
  availableClubSlots: number | null;
  clubSlotLimit: number | null;
  ownedClubCount: number;
  onTabChange: (value: (typeof CREATE_CLUB_TABS)[number]["value"]) => void;
  onFieldChange: (field: keyof ClubCreateFormState, value: any) => void;
  onFederationChange: (
    federationId: string,
    field: "name" | "registrationNumber" | "affiliationDate",
    value: string,
  ) => void;
  onFederationAdd: () => void;
  onFederationRemove: (federationId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function CardPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[28px] border border-slate-100 bg-slate-50/70 p-5">
      <p className="text-base font-semibold text-slate-900">{title}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}

export function AccountCreateClubDialog({
  open,
  onOpenChange,
  form,
  tab,
  creating,
  availableClubSlots,
  clubSlotLimit,
  ownedClubCount,
  onTabChange,
  onFieldChange,
  onFederationChange,
  onFederationAdd,
  onFederationRemove,
  onSubmit,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1180px] rounded-[34px] border-white/70 bg-white/90 p-0 shadow-[0_32px_120px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="rounded-t-[34px] bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-8 py-7 text-white">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              Configura un nuovo club
            </DialogTitle>
            <DialogDescription className="max-w-3xl text-blue-100">
              Questo pannello riprende la stessa logica della pagina Organizzazione:
              inserisci subito i dati essenziali e, se vuoi, anticipa gia anche
              fiscali, bancari, contatti, federazioni, social e logo.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={onSubmit} className="grid gap-0 lg:grid-cols-[320px_1fr]">
          <div className="space-y-5 border-b border-slate-100 bg-slate-50/80 px-8 py-7 lg:border-b-0 lg:border-r">
            <div className="space-y-4 rounded-[28px] bg-white p-5 shadow-sm">
              <div className="flex justify-center">
                <LogoUpload
                  currentLogo={form.logoUrl || null}
                  onLogoChange={(value) => onFieldChange("logoUrl", value || "")}
                  name={form.name || "Nuovo club"}
                  className="mx-auto"
                />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-lg font-semibold text-slate-900">
                  {form.name || "Nuovo club"}
                </p>
                <p className="text-sm text-slate-500">
                  {[form.city, form.province].filter(Boolean).join(", ") ||
                    "Localita non ancora indicata"}
                </p>
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Campi chiave
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Nome club
                </div>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Tipologia
                </div>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Indirizzo, citta e provincia
                </div>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Email e telefono di contatto
                </div>
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-600" />
                  Logo facoltativo ma gia disponibile
                </div>
              </div>
            </div>

            <div className="rounded-[28px] bg-gradient-to-br from-blue-700 to-sky-500 p-5 text-white shadow-sm">
              <p className="text-sm uppercase tracking-[0.18em] text-blue-100">
                Slot account
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {clubSlotLimit === null ? "∞" : availableClubSlots}
              </p>
              <p className="mt-2 text-sm text-blue-100">
                {clubSlotLimit === null
                  ? "Nessun limite configurato per questo account."
                  : `${ownedClubCount} club gia creati su ${clubSlotLimit} slot disponibili.`}
              </p>
            </div>
          </div>

          <div className="px-8 py-7">
            <Tabs
              value={tab}
              onValueChange={(value) =>
                onTabChange(value as (typeof CREATE_CLUB_TABS)[number]["value"])
              }
              className="space-y-6"
            >
              <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                {CREATE_CLUB_TABS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 data-[state=active]:border-blue-600 data-[state=active]:bg-blue-600 data-[state=active]:text-white"
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="max-h-[58vh] overflow-y-auto pr-2">
                <TabsContent value="general" className="mt-0">
                  <CardPanel title="Informazioni generali del club">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="club-name">Nome club *</Label>
                        <Input
                          id="club-name"
                          value={form.name}
                          onChange={(event) =>
                            onFieldChange("name", event.target.value)
                          }
                          placeholder="Es. EasyGame Academy"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-type">Tipologia *</Label>
                        <Input
                          id="club-type"
                          value={form.type}
                          onChange={(event) =>
                            onFieldChange("type", event.target.value)
                          }
                          placeholder="Es. Dilettante"
                          required
                        />
                        <div className="flex flex-wrap gap-2">
                          {CLUB_TYPE_PRESETS.map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                              onClick={() => onFieldChange("type", preset)}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-founding-year">Anno fondazione</Label>
                        <Input
                          id="club-founding-year"
                          type="number"
                          value={form.foundingYear}
                          onChange={(event) =>
                            onFieldChange("foundingYear", event.target.value)
                          }
                          placeholder="Es. 2012"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-country">Nazione</Label>
                        <Input
                          id="club-country"
                          value={form.country}
                          onChange={(event) =>
                            onFieldChange("country", event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="club-address">Indirizzo *</Label>
                        <Input
                          id="club-address"
                          value={form.address}
                          onChange={(event) =>
                            onFieldChange("address", event.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-city">Citta *</Label>
                        <Input
                          id="club-city"
                          value={form.city}
                          onChange={(event) =>
                            onFieldChange("city", event.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-province">Provincia *</Label>
                        <Input
                          id="club-province"
                          value={form.province}
                          onChange={(event) =>
                            onFieldChange("province", event.target.value)
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-region">Regione</Label>
                        <Input
                          id="club-region"
                          value={form.region}
                          onChange={(event) =>
                            onFieldChange("region", event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="club-postal-code">CAP</Label>
                        <Input
                          id="club-postal-code"
                          value={form.postalCode}
                          onChange={(event) =>
                            onFieldChange("postalCode", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </CardPanel>
                </TabsContent>

                <TabsContent value="fiscal" className="mt-0">
                  <div className="grid gap-6">
                    <CardPanel title="Dati societari e fiscali">
                      <div className="grid gap-4 md:grid-cols-2">
                        <InputWithLabel label="Ragione sociale" value={form.businessName} onChange={(value) => onFieldChange("businessName", value)} />
                        <InputWithLabel label="PEC" type="email" value={form.pec} onChange={(value) => onFieldChange("pec", value)} />
                        <InputWithLabel label="Partita IVA" value={form.vatNumber} onChange={(value) => onFieldChange("vatNumber", value)} />
                        <InputWithLabel label="Codice fiscale" value={form.fiscalCode} onChange={(value) => onFieldChange("fiscalCode", value)} />
                        <InputWithLabel label="Regime fiscale" value={form.taxRegime} onChange={(value) => onFieldChange("taxRegime", value)} />
                        <InputWithLabel label="Codice ATECO" value={form.atecoCode} onChange={(value) => onFieldChange("atecoCode", value)} />
                        <InputWithLabel label="Codice SDI" value={form.sdiCode} onChange={(value) => onFieldChange("sdiCode", value)} />
                      </div>
                    </CardPanel>

                    <CardPanel title="Sede legale e rappresentante">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="legal-address">Indirizzo sede legale</Label>
                          <Input
                            id="legal-address"
                            value={form.legalAddress}
                            onChange={(event) =>
                              onFieldChange("legalAddress", event.target.value)
                            }
                          />
                        </div>
                        <InputWithLabel label="Citta sede legale" value={form.legalCity} onChange={(value) => onFieldChange("legalCity", value)} />
                        <InputWithLabel label="CAP sede legale" value={form.legalPostalCode} onChange={(value) => onFieldChange("legalPostalCode", value)} />
                        <InputWithLabel label="Regione sede legale" value={form.legalRegion} onChange={(value) => onFieldChange("legalRegion", value)} />
                        <InputWithLabel label="Provincia sede legale" value={form.legalProvince} onChange={(value) => onFieldChange("legalProvince", value)} />
                        <InputWithLabel label="Paese sede legale" value={form.legalCountry} onChange={(value) => onFieldChange("legalCountry", value)} />
                        <InputWithLabel label="Nome rappresentante" value={form.representativeName} onChange={(value) => onFieldChange("representativeName", value)} />
                        <InputWithLabel label="Cognome rappresentante" value={form.representativeSurname} onChange={(value) => onFieldChange("representativeSurname", value)} />
                        <InputWithLabel label="Codice fiscale rappresentante" value={form.representativeFiscalCode} onChange={(value) => onFieldChange("representativeFiscalCode", value)} />
                      </div>
                    </CardPanel>
                  </div>
                </TabsContent>

                <TabsContent value="bank" className="mt-0">
                  <CardPanel title="Dati bancari">
                    <div className="grid gap-4 md:grid-cols-2">
                      <InputWithLabel label="Nome banca" value={form.bankName} onChange={(value) => onFieldChange("bankName", value)} />
                      <InputWithLabel label="IBAN" value={form.iban} onChange={(value) => onFieldChange("iban", value)} />
                    </div>
                  </CardPanel>
                </TabsContent>

                <TabsContent value="contacts" className="mt-0">
                  <div className="grid gap-6">
                    <CardPanel title="Contatti principali del club">
                      <div className="grid gap-4 md:grid-cols-2">
                        <InputWithLabel label="Email contatto *" type="email" value={form.contactEmail} onChange={(value) => onFieldChange("contactEmail", value)} required />
                        <InputWithLabel label="Telefono contatto *" value={form.contactPhone} onChange={(value) => onFieldChange("contactPhone", value)} required />
                      </div>
                    </CardPanel>

                    <CardPanel title="Contatto amministrativo">
                      <div className="grid gap-4 md:grid-cols-3">
                        <InputWithLabel label="Nome contatto" value={form.contact1Name} onChange={(value) => onFieldChange("contact1Name", value)} />
                        <InputWithLabel label="Telefono" value={form.contact1Phone} onChange={(value) => onFieldChange("contact1Phone", value)} />
                        <InputWithLabel label="Email" type="email" value={form.contact1Email} onChange={(value) => onFieldChange("contact1Email", value)} />
                      </div>
                    </CardPanel>

                    <CardPanel title="Secondo contatto">
                      <div className="grid gap-4 md:grid-cols-3">
                        <InputWithLabel label="Nome contatto" value={form.contact2Name} onChange={(value) => onFieldChange("contact2Name", value)} />
                        <InputWithLabel label="Telefono" value={form.contact2Phone} onChange={(value) => onFieldChange("contact2Phone", value)} />
                        <InputWithLabel label="Email" type="email" value={form.contact2Email} onChange={(value) => onFieldChange("contact2Email", value)} />
                      </div>
                    </CardPanel>
                  </div>
                </TabsContent>

                <TabsContent value="federation" className="mt-0">
                  <CardPanel title="Federazioni e affiliazioni">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-slate-500">
                        Se vuoi puoi anticipare gia le affiliazioni principali.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={onFederationAdd}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Aggiungi federazione
                      </Button>
                    </div>
                    <div className="mt-5 space-y-4">
                      {form.federations.length === 0 ? (
                        <div className="rounded-[22px] border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
                          Nessuna affiliazione inserita per ora.
                        </div>
                      ) : (
                        form.federations.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-[24px] border border-slate-200 bg-white p-4"
                          >
                            <div className="grid gap-4 md:grid-cols-[1.6fr_1fr_1fr_auto]">
                              <div className="space-y-2">
                                <Label>Federazione</Label>
                                <Input
                                  value={item.name}
                                  onChange={(event) =>
                                    onFederationChange(
                                      item.id,
                                      "name",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Es. FIGC - Federazione Italiana Giuoco Calcio"
                                />
                                <div className="flex flex-wrap gap-2">
                                  {FEDERATION_PRESETS.map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-blue-200 hover:text-blue-700"
                                      onClick={() =>
                                        onFederationChange(item.id, "name", preset)
                                      }
                                    >
                                      {preset.split(" - ")[0]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <InputWithLabel label="Numero iscrizione" value={item.registrationNumber} onChange={(value) => onFederationChange(item.id, "registrationNumber", value)} />
                              <InputWithLabel label="Data affiliazione" type="date" value={item.affiliationDate} onChange={(value) => onFederationChange(item.id, "affiliationDate", value)} />
                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full"
                                  onClick={() => onFederationRemove(item.id)}
                                >
                                  Rimuovi
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </CardPanel>
                </TabsContent>

                <TabsContent value="social" className="mt-0">
                  <CardPanel title="Social e presenza online">
                    <div className="grid gap-4 md:grid-cols-2">
                      <InputWithLabel label="Sito web" value={form.website} onChange={(value) => onFieldChange("website", value)} placeholder="https://..." />
                      <InputWithLabel label="Facebook" value={form.facebook} onChange={(value) => onFieldChange("facebook", value)} placeholder="https://facebook.com/..." />
                      <InputWithLabel label="Instagram" value={form.instagram} onChange={(value) => onFieldChange("instagram", value)} placeholder="https://instagram.com/..." />
                      <InputWithLabel label="X / Twitter" value={form.twitter} onChange={(value) => onFieldChange("twitter", value)} placeholder="https://x.com/..." />
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="youtube">YouTube</Label>
                        <Input
                          id="youtube"
                          value={form.youtube}
                          onChange={(event) =>
                            onFieldChange("youtube", event.target.value)
                          }
                          placeholder="https://youtube.com/..."
                        />
                      </div>
                    </div>
                  </CardPanel>
                </TabsContent>
              </div>
            </Tabs>

            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-6">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
              >
                Chiudi
              </Button>
              <Button
                type="submit"
                className="rounded-full bg-blue-600 hover:bg-blue-700"
                disabled={creating}
              >
                {creating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Crea club
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InputWithLabel({
  label,
  value,
  onChange,
  id,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const inputId =
    id ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input
        id={inputId}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}

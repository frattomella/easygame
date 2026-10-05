"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Monitor, Smartphone } from "lucide-react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { DashboardPageContainer, dashboardMainClassName } from "@/components/dashboard/dashboard-page-container";
import { useAuth } from "@/components/providers/AuthProvider";
import { PageHeader } from "@/components/web/page/PageHeader";
import { AlertBlock } from "@/components/web/page/Alerts";
import { SegmentedControl } from "@/components/web/primitives/Controls";
import { useBreadcrumbLabel } from "@/components/web/shell/ShellProvider";
import { FormRenderer } from "@/components/forms/form-renderer";
import { applyServerFieldOptions, EMPTY_FORM_OPTION_CATALOG, type FormOptionCatalog } from "@/lib/forms/field-options";
import { normalizeFormSchema, type FormSchema } from "@/lib/forms/model";
import { roleHasPermission } from "@/lib/permissions/catalog";
import * as formsApi from "@/lib/api/forms";

/**
 * **L'anteprima web di un modulo** (`/modulistica/moduli/[id]/anteprima`,
 * ADR-0190 §4): la bozza com'e adesso, con lo **stesso** renderer del
 * modulo pubblico, a larghezza intera e dentro una cornice da 375 px. Non
 * scrive niente: le risposte restano in memoria e non c'e un pulsante
 * «Invia». Il club vede cio che vedra il genitore.
 */
function FormPreviewContent() {
  const params = useParams<{ id: string }>();
  const { activeClub } = useAuth();
  const templateId = String(params?.id || "");
  const [schema, setSchema] = React.useState<FormSchema | null>(null);
  const [title, setTitle] = React.useState("Anteprima");
  const [error, setError] = React.useState("");
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const [values, setValues] = React.useState<Record<string, unknown>>({});
  const [files, setFiles] = React.useState<Record<string, File | null>>({});
  useBreadcrumbLabel("Anteprima");

  const canRead = roleHasPermission(activeClub?.role || null, "forms.templates.read");

  React.useEffect(() => {
    if (!templateId || !canRead) return;
    let alive = true;
    formsApi
      .fetchFormTemplate(templateId)
      .then((template) => {
        if (!alive) return;
        const draft = normalizeFormSchema(template.draft);
        setSchema(applyServerFieldOptions(draft, (template.optionCatalog as FormOptionCatalog | undefined) || EMPTY_FORM_OPTION_CATALOG));
        setTitle(draft.title);
      })
      .catch((err: any) => {
        if (alive) setError(err?.message || "Non riesco a leggere il modulo");
      });
    return () => {
      alive = false;
    };
  }, [canRead, templateId]);

  const modulo = schema ? (
    <div className="w-full">
      <header className="rounded-t-egw-panel border border-b-0 border-egw-hairline bg-white p-5">
        <p className="font-brand text-sm font-semibold text-egw-ink-72">{activeClub?.name || "Il club"}</p>
        <h2 className="mt-3 font-brand text-xl font-semibold text-egw-ink">{schema.title}</h2>
        {schema.description ? <p className="mt-2 whitespace-pre-line text-sm text-egw-ink-72">{schema.description}</p> : null}
      </header>
      <div className="space-y-6 rounded-b-egw-panel border border-t-0 border-egw-hairline bg-white p-5">
        <FormRenderer
          fields={schema.fields}
          values={values}
          files={files}
          onChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))}
          onFileChange={(fieldId, file) => setFiles((current) => ({ ...current, [fieldId]: file }))}
        />
        <p className="rounded-egw-control border border-dashed border-egw-hairline p-3 text-center text-xs text-egw-ink-62">
          Anteprima: qui il genitore troverebbe «Salva e continua dopo» e «Invia». Niente viene inviato.
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className="flex h-[100dvh] bg-egw-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title="Anteprima del modulo" />
        <main className={dashboardMainClassName}>
          <DashboardPageContainer>
            <PageHeader
              eyebrow="Modulistica · Moduli online"
              title={title}
              description="Il modulo come lo vedra chi lo compila, dalla bozza corrente. Non scrive niente."
              context={
                <SegmentedControl<"desktop" | "mobile">
                  aria-label="Dispositivo"
                  value={device}
                  onChange={setDevice}
                  options={[
                    { value: "desktop", label: (<span className="inline-flex items-center gap-1.5"><Monitor className="h-3.5 w-3.5" aria-hidden />Desktop</span>) },
                    { value: "mobile", label: (<span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" aria-hidden />Telefono · 375 px</span>) },
                  ]}
                />
              }
            />
            {!canRead ? <AlertBlock severity="warning" title="Accesso negato" >Le anteprime dei moduli le vede chi gestisce le pratiche.</AlertBlock> : null}
            {error ? <AlertBlock severity="danger" role="alert" title={error} /> : null}
            {schema ? (
              device === "mobile" ? (
                <div className="flex justify-center">
                  <div
                    className="egw-scroll h-[720px] w-[375px] max-w-full overflow-y-auto rounded-[28px] border-[6px] border-egw-navy-800 bg-egw-page p-3 shadow-egw-plane-2"
                    data-test="preview-mobile-frame"
                  >
                    {modulo}
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-[760px]" data-test="preview-desktop-frame">{modulo}</div>
              )
            ) : null}
          </DashboardPageContainer>
        </main>
      </div>
    </div>
  );
}

export default function FormPreviewPage() {
  return (
    <Suspense fallback={null}>
      <FormPreviewContent />
    </Suspense>
  );
}

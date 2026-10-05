"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/dashboard/Header";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  DashboardPageContainer,
  dashboardMainClassName,
} from "@/components/dashboard/dashboard-page-container";
import { SharedPageHeader } from "@/components/dashboard/shared-page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/providers/AuthProvider";
import { isPlatformAdminUser } from "@/lib/platform-admin";
import {
  internalApiAreas,
  internalApiRegistry,
} from "@/lib/api-docs/internal-api-registry";
import { Download, Loader2, LockKeyhole, Search } from "lucide-react";

const getStatusClassName = (status: string) => {
  if (status === "Pronta") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "Interna") {
    return "border-slate-200 bg-slate-100 text-slate-700";
  }

  if (status === "Da verificare") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-red-200 bg-red-50 text-red-700";
};

const isAuthorizedApiDocsUser = (user: any) => isPlatformAdminUser(user);

export function ApiDocsClient() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");
  const [areaFilter, setAreaFilter] = useState("Tutte");

  const canAccess = useMemo(
    () => isAuthorizedApiDocsUser(user),
    [user],
  );

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }
  }, [loading, router, user?.id]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return internalApiRegistry.filter((entry) => {
      const matchesArea = areaFilter === "Tutte" || entry.area === areaFilter;
      const matchesQuery =
        !normalizedQuery ||
        [
          entry.area,
          entry.method,
          entry.path,
          entry.description,
          entry.auth,
          entry.params,
          entry.body,
          entry.response,
          entry.mobileNotes,
          entry.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesArea && matchesQuery;
    });
  }, [areaFilter, query]);

  const entriesByArea = useMemo(() => {
    const groups = new Map<string, typeof filteredEntries>();

    filteredEntries.forEach((entry) => {
      const current = groups.get(entry.area) || [];
      current.push(entry);
      groups.set(entry.area, current);
    });

    return Array.from(groups.entries());
  }, [filteredEntries]);

  const allEntriesByArea = internalApiAreas.map((area) => [
    area,
    internalApiRegistry.filter((entry) => entry.area === area),
  ] as const);

  const handleDownloadPdf = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-[100dvh] bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento documentazione API...
          </div>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className="flex h-[100dvh] bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Reindirizzamento al login...
          </div>
        </div>
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex h-[100dvh] bg-gray-50">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="API interne EasyGame" />
          <main className="flex flex-1 items-center justify-center p-6">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <LockKeyhole className="h-5 w-5 text-red-600" />
                  Accesso non autorizzato
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Questa pagina è riservata agli amministratori piattaforma
                  autorizzati.
                </p>
                <Button onClick={() => router.replace("/account")}>
                  Torna all&apos;account
                </Button>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .api-docs-print-only {
              display: none;
            }

            @media print {
              @page {
                margin: 12mm;
                size: A4;
              }

              body {
                background: #ffffff !important;
              }

              .api-docs-screen {
                display: none !important;
              }

              .api-docs-print-only {
                color: #0f172a;
                display: block !important;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 11px;
                line-height: 1.35;
              }

              .api-docs-print-header {
                border-bottom: 2px solid #0f172a;
                margin-bottom: 16px;
                padding-bottom: 10px;
              }

              .api-docs-print-kicker {
                color: #475569;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.08em;
                margin: 0 0 4px;
                text-transform: uppercase;
              }

              .api-docs-print-title {
                font-size: 22px;
                line-height: 1.1;
                margin: 0 0 6px;
              }

              .api-docs-print-meta {
                color: #475569;
                margin: 0;
              }

              .api-docs-print-area {
                break-inside: avoid;
                margin-bottom: 16px;
                page-break-inside: avoid;
              }

              .api-docs-print-area-title {
                border-bottom: 1px solid #cbd5e1;
                font-size: 15px;
                margin: 0 0 8px;
                padding-bottom: 4px;
              }

              .api-docs-print-entry {
                break-inside: avoid;
                border: 1px solid #e2e8f0;
                border-radius: 6px;
                margin-bottom: 8px;
                padding: 8px;
                page-break-inside: avoid;
              }

              .api-docs-print-route {
                align-items: center;
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin-bottom: 6px;
              }

              .api-docs-print-method,
              .api-docs-print-status {
                border: 1px solid #cbd5e1;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                padding: 2px 6px;
              }

              .api-docs-print-path {
                background: #f1f5f9;
                border-radius: 4px;
                font-family: Consolas, Monaco, monospace;
                font-size: 10px;
                padding: 2px 5px;
              }

              .api-docs-print-description {
                font-weight: 700;
                margin: 0 0 6px;
              }

              .api-docs-print-grid {
                display: grid;
                gap: 5px 12px;
                grid-template-columns: repeat(2, minmax(0, 1fr));
              }

              .api-docs-print-grid p {
                margin: 0;
              }

              .api-docs-print-label {
                color: #475569;
                font-weight: 700;
              }
            }
          `,
        }}
      />
      <div className="api-docs-screen flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title="API interne EasyGame" />
          <main className={dashboardMainClassName}>
            <DashboardPageContainer className="max-w-7xl">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <SharedPageHeader
                    eyebrow="Pagina riservata piattaforma"
                    title="API interne EasyGame"
                    subtitle="Registro operativo degli endpoint esistenti, pensato per futura integrazione mobile e manutenzione interna."
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-2 sm:items-start lg:items-end">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      {filteredEntries.length} endpoint visibili su{" "}
                      {internalApiRegistry.length}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadPdf}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Scarica PDF completo
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cerca endpoint, metodo, area o note mobile..."
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {["Tutte", ...internalApiAreas].map((area) => (
                    <Button
                      key={area}
                      type="button"
                      size="sm"
                      variant={areaFilter === area ? "default" : "outline"}
                      className="whitespace-nowrap"
                      onClick={() => setAreaFilter(area)}
                    >
                      {area}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-5">
                {entriesByArea.map(([area, entries]) => (
                  <section key={area} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-950">
                        {area}
                      </h2>
                      <Badge variant="outline">{entries.length}</Badge>
                    </div>
                    <div className="grid gap-3">
                      {entries.map((entry) => (
                        <Card key={`${entry.method}-${entry.path}`}>
                          <CardContent className="p-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary">
                                    {entry.method}
                                  </Badge>
                                  <code className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-800">
                                    {entry.path}
                                  </code>
                                  <Badge
                                    variant="outline"
                                    className={getStatusClassName(entry.status)}
                                  >
                                    {entry.status}
                                  </Badge>
                                </div>
                                <p className="text-sm font-medium text-slate-900">
                                  {entry.description}
                                </p>
                              </div>
                              <p className="text-xs font-medium text-slate-500">
                                Auth: {entry.auth}
                              </p>
                            </div>

                            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-400">
                                  Parametri
                                </p>
                                <p className="mt-1 text-slate-700">
                                  {entry.params}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-400">
                                  Body
                                </p>
                                <p className="mt-1 text-slate-700">
                                  {entry.body}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-400">
                                  Response
                                </p>
                                <p className="mt-1 text-slate-700">
                                  {entry.response}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs font-semibold uppercase text-slate-400">
                                  Note mobile
                                </p>
                                <p className="mt-1 text-slate-700">
                                  {entry.mobileNotes}
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </DashboardPageContainer>
          </main>
        </div>
      </div>
      <div className="api-docs-print-only" aria-hidden="true">
        <header className="api-docs-print-header">
          <p className="api-docs-print-kicker">EasyGame</p>
          <h1 className="api-docs-print-title">API interne EasyGame</h1>
          <p className="api-docs-print-meta">
            Registro completo degli endpoint interni. Totale:{" "}
            {internalApiRegistry.length} API.
          </p>
        </header>

        {allEntriesByArea.map(([area, entries]) => (
          <section key={`print-${area}`} className="api-docs-print-area">
            <h2 className="api-docs-print-area-title">
              {area} ({entries.length})
            </h2>
            {entries.map((entry) => (
              <article
                key={`print-${entry.method}-${entry.path}`}
                className="api-docs-print-entry"
              >
                <div className="api-docs-print-route">
                  <span className="api-docs-print-method">{entry.method}</span>
                  <code className="api-docs-print-path">{entry.path}</code>
                  <span className="api-docs-print-status">{entry.status}</span>
                </div>
                <p className="api-docs-print-description">
                  {entry.description}
                </p>
                <div className="api-docs-print-grid">
                  <p>
                    <span className="api-docs-print-label">Auth:</span>{" "}
                    {entry.auth}
                  </p>
                  <p>
                    <span className="api-docs-print-label">Parametri:</span>{" "}
                    {entry.params}
                  </p>
                  <p>
                    <span className="api-docs-print-label">Body:</span>{" "}
                    {entry.body}
                  </p>
                  <p>
                    <span className="api-docs-print-label">Response:</span>{" "}
                    {entry.response}
                  </p>
                  <p>
                    <span className="api-docs-print-label">Mobile:</span>{" "}
                    {entry.mobileNotes}
                  </p>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

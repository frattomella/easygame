"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { AlertCircle, CheckCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface CertificationAlert {
  id: string;
  athleteName: string;
  certificateType: string;
  expiryDate: string;
  status: "expired" | "expiring" | "missing" | "valid";
}

interface CertificationAlertsProps {
  alerts?: CertificationAlert[];
  onViewAll?: () => void;
  onViewAthlete?: (id: string) => void;
  onSendReminder?: (id: string) => boolean | void;
  isLoading?: boolean;
  organizationId?: string | null;
  showEmptyState?: boolean;
  variant?: "card" | "embedded";
  maxHeight?: string;
}

const EMPTY_CERTIFICATION_ALERTS: CertificationAlert[] = [];

const CertificationAlerts = ({
  alerts = EMPTY_CERTIFICATION_ALERTS,
  onViewAll = () => console.log("View all alerts"),
  onViewAthlete = (id) => console.log(`View athlete ${id}`),
  onSendReminder = (id) => {
    console.log(`Send reminder to athlete ${id}`);
    return true; // Return true to indicate success
  },
  isLoading = false,
  organizationId = null,
  showEmptyState = false,
  variant = "card",
  maxHeight = "320px",
}: CertificationAlertsProps) => {
  const router = useRouter();
  const [loadedAlerts, setLoadedAlerts] =
    useState<CertificationAlert[]>(alerts);
  const [loading, setLoading] = useState(isLoading);
  const MAX_VISIBLE_ALERTS = 6;
  const alertsRef = React.useRef(alerts);
  const alertsSignature = React.useMemo(
    () =>
      alerts
        .map((alert) =>
          [
            alert.id,
            alert.athleteName,
            alert.certificateType,
            alert.expiryDate,
            alert.status,
          ].join(":"),
        )
        .join("|"),
    [alerts],
  );

  useEffect(() => {
    alertsRef.current = alerts;
  }, [alertsSignature, alerts]);

  useEffect(() => {
    let isMounted = true;

    const fetchCertificateAlerts = async () => {
      const providedAlerts = alertsRef.current;

      if (providedAlerts.length > 0) {
        setLoadedAlerts(providedAlerts);
        setLoading(false);
        return;
      }

      // If showEmptyState is true, don't fetch any data
      if (showEmptyState) {
        if (isMounted) {
          setLoadedAlerts([]);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        let effectiveOrganizationId = organizationId;

        if (!effectiveOrganizationId) {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user) {
            if (isMounted) {
              setLoading(false);
            }
            return;
          }

          const { data: orgUser } = await supabase
            .from("organization_users")
            .select("organization_id")
            .eq("user_id", session.user.id)
            .eq("is_primary", true)
            .single();

          effectiveOrganizationId = orgUser?.organization_id || null;
        }

        if (!effectiveOrganizationId) {
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        // Get current date
        const today = new Date();

        // Get date 30 days from now for "expiring" status
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        // Fetch all athletes first to check for missing certificates
        const { data: allAthletes } = await supabase
          .from("athletes")
          .select("id, first_name, last_name")
          .eq("organization_id", effectiveOrganizationId);

        // Fetch all certificates for the club so missing vs expired stays correct.
        const { data: certificates } = await supabase
          .from("medical_certificates")
          .select(
            `
            id,
            type,
            expiry_date,
            athlete_id,
            athletes!inner(id, first_name, last_name, organization_id)
          `,
          )
          .eq("athletes.organization_id", effectiveOrganizationId);

        const formattedAlerts: CertificationAlert[] = [];

        if (certificates) {
          // Transform the data to match our component's expected format
          const certificateAlerts = certificates
            .map((cert) => {
              if (!cert?.expiry_date) {
                return null;
              }

              const expiryDate = new Date(cert.expiry_date);
              if (Number.isNaN(expiryDate.getTime())) {
                return null;
              }

              let status: "expired" | "expiring" | "valid" = "valid";

              if (expiryDate < today) {
                status = "expired";
              } else if (expiryDate <= thirtyDaysFromNow) {
                status = "expiring";
              }

              return {
                id: cert.athletes.id,
                athleteName: `${cert.athletes.first_name} ${cert.athletes.last_name}`,
                certificateType: cert.type || "Certificato Medico",
                expiryDate: cert.expiry_date,
                status,
              };
            })
            .filter(Boolean) as CertificationAlert[];
          formattedAlerts.push(...certificateAlerts);
        }

        // Athletes without certificates are missing, not expired.
        if (allAthletes) {
          const athletesWithCertificates = new Set(
            certificates?.map((cert) => cert.athlete_id) || [],
          );

          const athletesWithoutCertificates = allAthletes.filter(
            (athlete) => !athletesWithCertificates.has(athlete.id),
          );

          // Add missing alerts for athletes without certificates
          const noCertificateAlerts = athletesWithoutCertificates.map(
            (athlete) => ({
              id: athlete.id,
              athleteName: `${athlete.first_name} ${athlete.last_name}`,
              certificateType: "Certificato Medico Mancante",
              expiryDate: "",
              status: "missing" as const,
            }),
          );

          formattedAlerts.push(...noCertificateAlerts);
        }

        // Sort by status severity while keeping missing separate from expired.
        formattedAlerts.sort((a, b) => {
          if (a.status === "missing" && b.status === "expired") return 1;
          if (a.status === "expired" && b.status === "missing") return -1;
          if (a.status === "expired" && b.status !== "expired") return -1;
          if (a.status !== "expired" && b.status === "expired") return 1;
          if (a.status === "missing" && b.status !== "missing") return -1;
          if (a.status !== "missing" && b.status === "missing") return 1;
          if (a.status === "expiring" && b.status === "valid") return -1;
          if (a.status === "valid" && b.status === "expiring") return 1;
          return 0;
        });

        if (isMounted) {
          setLoadedAlerts(formattedAlerts);
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching certificate alerts:", error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchCertificateAlerts();

    return () => {
      isMounted = false;
    };
  }, [alertsSignature, organizationId, showEmptyState]);

  const getStatusIcon = (status: CertificationAlert["status"]) => {
    switch (status) {
      case "expired":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case "expiring":
        return <Clock className="h-5 w-5 text-amber-500" />;
      case "missing":
        return <AlertCircle className="h-5 w-5 text-slate-500" />;
      case "valid":
        return <CheckCircle className="h-5 w-5 text-gray-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: CertificationAlert["status"]) => {
    switch (status) {
      case "expired":
        return <Badge variant="destructive">Scaduto</Badge>;
      case "expiring":
        return (
          <Badge variant="secondary" className="bg-amber-500 text-white">
            In Scadenza
          </Badge>
        );
      case "missing":
        return (
          <Badge variant="secondary" className="bg-slate-200 text-slate-900">
            Mancante
          </Badge>
        );
      case "valid":
        return (
          <Badge variant="secondary" className="bg-gray-500 text-white">
            Valido
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) {
      return "Non presente";
    }

    const date = new Date(dateString);
    return date.toLocaleDateString("it-IT", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleSendReminder = (id: string, athleteName: string) => {
    const result = onSendReminder(id);
    if (result !== false) {
      // Show success toast directly using the useToast hook
      if (typeof document !== "undefined") {
        // Try to use the custom event first for backward compatibility
        try {
          const event = new CustomEvent("show-toast", {
            detail: {
              type: "success",
              message: `Promemoria inviato a ${athleteName}`,
            },
          });
          document.dispatchEvent(event);
        } catch (error) {
          console.log(`Promemoria inviato a ${athleteName}`);
        }
      }

      // Send an email notification (simulated)
      setTimeout(() => {
        console.log(
          `Email di promemoria inviata a ${athleteName} per il certificato in scadenza`,
        );
      }, 1000);
    }
  };

  const handleViewAllAlerts = () => {
    onViewAll();
    router.push("/medical");
  };

  const visibleAlerts = loadedAlerts.slice(0, MAX_VISIBLE_ALERTS);
  const hiddenAlertsCount = Math.max(loadedAlerts.length - visibleAlerts.length, 0);
  const isEmbedded = variant === "embedded";
  const shellClassName = cn(
    "w-full",
    isEmbedded
      ? "border-0 bg-transparent shadow-none"
      : "bg-white dark:bg-gray-800 shadow-md border-0",
  );
  const headerClassName = cn(
    "flex flex-row items-center justify-between",
    isEmbedded
      ? "px-0 pb-3 pt-0"
      : "pb-2 border-b border-gray-100 dark:border-gray-700",
  );
  const contentClassName = isEmbedded ? "px-0 pb-0 pt-0" : "pt-4";

  if (loading) {
    return (
      <Card className={shellClassName}>
        <CardHeader className={headerClassName}>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-white" />
            </div>
            Avvisi certificati
          </CardTitle>
          <Button variant="outline" size="sm" disabled>
            Vedi Tutti
          </Button>
        </CardHeader>
        <CardContent className={contentClassName}>
          <div
            className="space-y-4 overflow-y-auto pr-1 scrollbar-hide"
            style={{ maxHeight }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="flex items-start space-x-4 p-4 rounded-lg border animate-pulse"
                >
                  <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 mt-1"></div>
                  <div className="flex-1 space-y-2">
                    <div className="flex justify-between">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    </div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mt-2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={shellClassName}>
      <CardHeader className={headerClassName}>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 flex items-center justify-center">
            <AlertCircle className="h-4 w-4 text-white" />
          </div>
          Avvisi certificati
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewAllAlerts}
          className="hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300"
        >
          Vedi Tutti
        </Button>
      </CardHeader>
      <CardContent className={contentClassName}>
        <div
          className="space-y-4 overflow-y-auto pr-1 scrollbar-hide"
          style={{ maxHeight }}
        >
          {loadedAlerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
              <div className="h-16 w-16 rounded-full bg-gradient-to-r from-gray-100 to-gray-200 flex items-center justify-center mb-3">
                <AlertCircle className="h-8 w-8 text-gray-500" />
              </div>
              <p className="font-medium">Nessun avviso sui certificati</p>
              <p className="text-sm">
                Gli avvisi sui certificati in scadenza appariranno qui
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start space-x-4 p-4 rounded-lg border hover:shadow-md transition-shadow bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-750"
                >
                  <div className="mt-1">{getStatusIcon(alert.status)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">{alert.athleteName}</h4>
                      {getStatusBadge(alert.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {alert.certificateType}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Scadenza:</span>{" "}
                      {formatDate(alert.expiryDate)}
                    </p>
                    <div className="flex space-x-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onViewAthlete(alert.id)}
                      >
                        Vedi Profilo
                      </Button>
                      {(alert.status === "expired" ||
                        alert.status === "expiring" ||
                        alert.status === "missing") && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleSendReminder(alert.id, alert.athleteName)
                          }
                        >
                          Invia Promemoria
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
              {hiddenAlertsCount > 0 ? (
                <button
                  type="button"
                  onClick={handleViewAllAlerts}
                  className="w-full rounded-xl border border-dashed border-orange-300 bg-orange-50/80 px-4 py-3 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100"
                >
                  +{hiddenAlertsCount} altri atleti con certificato scaduto, in scadenza o mancante.
                  Vai alla pagina certificati
                </button>
              ) : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CertificationAlerts;

"use client";

import React, { memo, useMemo, useCallback } from "react";
import { supabase, cachedQuery } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { debounce, memoize } from "@/lib/performance";
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Users,
  Layers,
  AlertCircle,
} from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  trend?: {
    value: string;
    positive: boolean;
  };
  className?: string;
  onClick?: () => void;
  colorScheme?: "blue" | "green" | "purple" | "orange" | "red";
}

const MetricCard = memo(
  ({
    title = "Metric",
    value = "0",
    icon = <Users className="h-5 w-5" />,
    trend,
    className = "",
    onClick,
    colorScheme = "blue",
  }: MetricCardProps) => {
    const handleClick = useCallback(() => {
      if (onClick) onClick();
    }, [onClick]);

    const colorClasses = {
      blue: "from-blue-500 to-blue-600",
      green: "from-emerald-500 to-emerald-600",
      purple: "from-purple-500 to-purple-600",
      orange: "from-orange-500 to-orange-600",
      red: "from-red-500 to-red-600",
    };

    const iconBgClasses = {
      blue: "bg-blue-100 text-blue-600",
      green: "bg-emerald-100 text-emerald-600",
      purple: "bg-purple-100 text-purple-600",
      orange: "bg-orange-100 text-orange-600",
      red: "bg-red-100 text-red-600",
    };

    return (
      <Card
        className={`bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-all duration-300 border-0 overflow-hidden ${className}`}
        onClick={handleClick}
      >
        <div
          className={`h-1 w-full bg-gradient-to-r ${colorClasses[colorScheme]}`}
        ></div>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div
            className={`h-10 w-10 rounded-full ${iconBgClasses[colorScheme]} p-2 flex items-center justify-center`}
          >
            {icon}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{value}</div>
          {trend && (
            <div className="mt-2 flex items-center text-xs">
              {trend.positive ? (
                <ArrowUp className="mr-1 h-3 w-3 text-green-500" />
              ) : (
                <ArrowDown className="mr-1 h-3 w-3 text-red-500" />
              )}
              <span
                className={trend.positive ? "text-green-500" : "text-red-500"}
              >
                {trend.value}
              </span>
              <span className="ml-1 text-muted-foreground">
                rispetto al mese scorso
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  },
);

MetricCard.displayName = "MetricCard";

interface MetricsOverviewProps {
  totalAthletes?: number;
  activeCategories?: number;
  upcomingTrainings?: number;
  expiringCertificates?: number;
  expiredCertificates?: number;
  athletesTrend?: {
    value: string;
    positive: boolean;
  };
  categoriesTrend?: {
    value: string;
    positive: boolean;
  };
  trainingsTrend?: {
    value: string;
    positive: boolean;
  };
  certificatesTrend?: {
    value: string;
    positive: boolean;
  };
  expiredCertificatesTrend?: {
    value: string;
    positive: boolean;
  };
  isLoading?: boolean;
  organizationId?: string | null;
  showEmptyState?: boolean;
}

const AnimatedContent: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="relative will-change-transform transition-all duration-500 ease-out hover:-translate-y-1 hover:shadow-lg">
      {children}
    </div>
  );
};

const MetricsOverview = ({
  totalAthletes,
  activeCategories,
  upcomingTrainings,
  expiringCertificates,
  expiredCertificates,
  athletesTrend,
  categoriesTrend,
  trainingsTrend,
  certificatesTrend,
  expiredCertificatesTrend,
  isLoading = false,
  organizationId = null,
  showEmptyState = false,
}: MetricsOverviewProps) => {
  const [realMetrics, setRealMetrics] = React.useState({
    totalAthletes: 0,
    activeCategories: 0,
    upcomingTrainings: 0,
    expiringCertificates: 0,
    expiredCertificates: 0,
  });
  const [metricsLoading, setMetricsLoading] = React.useState(false);

  // Memoized metrics calculation
  const calculateMetrics = useMemo(
    () =>
      memoize(async (orgId: string) => {
        if (!orgId) {
          return {
            totalAthletes: 0,
            activeCategories: 0,
            upcomingTrainings: 0,
            expiringCertificates: 0,
            expiredCertificates: 0,
          };
        }

        try {
          // Use cached queries for better performance
          const [clubData, athletesData, allAthletes, allCertificates] =
            await Promise.all([
              cachedQuery(`club-${orgId}`, () =>
                supabase
                  .from("clubs")
                  .select("categories, trainings")
                  .eq("id", orgId)
                  .single(),
              ),
              cachedQuery(`athletes-${orgId}`, () =>
                supabase
                  .from("simplified_athletes")
                  .select("*")
                  .eq("club_id", orgId),
              ),
              cachedQuery(`all-athletes-${orgId}`, () =>
                supabase
                  .from("simplified_athletes")
                  .select("id")
                  .eq("club_id", orgId),
              ),
              cachedQuery(`certificates-${orgId}`, () =>
                supabase
                  .from("medical_certificates")
                  .select("athlete_id, expiry_date")
                  .eq("organization_id", orgId),
              ),
            ]);

          // Calculate metrics efficiently
          const activeAthletes = (athletesData?.data || []).filter(
            (athlete: any) => {
              const status = athlete.data?.status || "active";
              return status === "active";
            },
          );

          const categories = clubData?.data?.categories || [];
          const trainings = clubData?.data?.trainings || [];

          // Count upcoming trainings (next 30 days)
          const today = new Date();
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(today.getDate() + 30);

          const upcomingTrainingsCount = trainings.filter((training: any) => {
            if (!training.date) return false;
            const trainingDate = new Date(training.date);
            return (
              trainingDate >= today &&
              trainingDate <= thirtyDaysFromNow &&
              training.status !== "cancelled" &&
              training.status !== "annullato"
            );
          }).length;

          // Count expiring and expired certificates
          const certificates = allCertificates?.data || [];
          const expiringCerts = certificates.filter((cert) => {
            const expiryDate = new Date(cert.expiry_date);
            return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
          });

          const expiredCerts = certificates.filter((cert) => {
            const expiryDate = new Date(cert.expiry_date);
            return expiryDate < today;
          });

          // Count athletes without any certificates
          const athletesWithCertificates = new Set(
            certificates.map((cert) => cert.athlete_id),
          );
          const athletesWithoutCertificates = (allAthletes?.data || []).filter(
            (athlete) => !athletesWithCertificates.has(athlete.id),
          );

          return {
            totalAthletes: activeAthletes.length,
            activeCategories: categories.length,
            upcomingTrainings: upcomingTrainingsCount,
            expiringCertificates: expiringCerts.length,
            expiredCertificates:
              expiredCerts.length + athletesWithoutCertificates.length,
          };
        } catch (error) {
          console.error("Error calculating metrics:", error);
          return {
            totalAthletes: 0,
            activeCategories: 0,
            upcomingTrainings: 0,
            expiringCertificates: 0,
            expiredCertificates: 0,
          };
        }
      }),
    [],
  );

  // Debounced metrics loading
  const debouncedLoadMetrics = useMemo(
    () =>
      debounce(async (orgId: string) => {
        if (!orgId || showEmptyState) {
          setRealMetrics({
            totalAthletes: 0,
            activeCategories: 0,
            upcomingTrainings: 0,
            expiringCertificates: 0,
            expiredCertificates: 0,
          });
          return;
        }

        setMetricsLoading(true);
        try {
          const metrics = await calculateMetrics(orgId);
          setRealMetrics(metrics);
        } finally {
          setMetricsLoading(false);
        }
      }, 300),
    [calculateMetrics, showEmptyState],
  );

  // Load real metrics from database
  React.useEffect(() => {
    if (organizationId) {
      debouncedLoadMetrics(organizationId);
    }
  }, [organizationId, debouncedLoadMetrics]);

  // Use real metrics or provided props
  const displayTotalAthletes = totalAthletes ?? realMetrics.totalAthletes;
  const displayActiveCategories =
    activeCategories ?? realMetrics.activeCategories;
  const displayUpcomingTrainings =
    upcomingTrainings ?? realMetrics.upcomingTrainings;
  const displayExpiringCertificates =
    expiringCertificates ?? realMetrics.expiringCertificates;
  const displayExpiredCertificates =
    expiredCertificates ?? realMetrics.expiredCertificates;

  const displayAthletesTrend = athletesTrend;
  const displayCategoriesTrend = categoriesTrend;
  const displayTrainingsTrend = trainingsTrend;
  const displayCertificatesTrend = certificatesTrend;
  const displayExpiredCertificatesTrend = expiredCertificatesTrend;

  return (
    <div className="w-full bg-transparent p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatedContent>
          <MetricCard
            title="Atleti Totali"
            value={displayTotalAthletes.toString()}
            icon={<Users className="h-5 w-5" />}
            trend={displayAthletesTrend}
            onClick={() => (window.location.href = "/athletes")}
            className="cursor-pointer"
            colorScheme="blue"
          />
        </AnimatedContent>
        <AnimatedContent>
          <MetricCard
            title="Categorie Attive"
            value={displayActiveCategories.toString()}
            icon={<Layers className="h-5 w-5" />}
            trend={displayCategoriesTrend}
            onClick={() => (window.location.href = "/categories")}
            className="cursor-pointer"
            colorScheme="green"
          />
        </AnimatedContent>
        <AnimatedContent>
          <MetricCard
            title="Certificati in Scadenza"
            value={displayExpiringCertificates.toString()}
            icon={<AlertCircle className="h-5 w-5" />}
            trend={displayCertificatesTrend}
            onClick={() => (window.location.href = "/medical")}
            className="cursor-pointer"
            colorScheme="orange"
          />
        </AnimatedContent>
        <AnimatedContent>
          <MetricCard
            title="Certificati Scaduti"
            value={displayExpiredCertificates.toString()}
            icon={<AlertCircle className="h-5 w-5" />}
            trend={displayExpiredCertificatesTrend}
            onClick={() => (window.location.href = "/medical")}
            className="cursor-pointer"
            colorScheme="red"
          />
        </AnimatedContent>
      </div>
    </div>
  );
};

export default MetricsOverview;

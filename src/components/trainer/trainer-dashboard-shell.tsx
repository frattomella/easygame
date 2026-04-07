"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/toast-notification";
import { getClubAthletes, getClubData } from "@/lib/simplified-db";
import {
  getTrainerCategoryIds,
  getTrainerDisplayName,
  normalizeTrainerCategories,
} from "@/lib/trainer-utils";
import {
  CalendarDays,
  Clock3,
  Dumbbell,
  Loader2,
  LogOut,
  MapPin,
  ShieldCheck,
  Trophy,
  UserCircle2,
  Users,
} from "lucide-react";

const EASYGAME_LOGO = "/logo-blu.png";

const normalizeValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getInitials = (value: string) =>
  value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() || "")
    .join("");

const formatDate = (value: any) => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const toDateTime = (dateValue: any, timeValue?: string | null) => {
  const parsed = dateValue ? new Date(dateValue) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (timeValue) {
    const [hours, minutes] = String(timeValue).split(":");
    parsed.setHours(Number(hours) || 0, Number(minutes) || 0, 0, 0);
  }

  return parsed;
};

const getStatusBadge = (status: string | null | undefined, startsAt: Date | null) => {
  const normalized = normalizeValue(status);
  if (normalized === "cancelled") {
    return {
      label: "Annullato",
      className:
        "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50",
    };
  }

  if (startsAt && startsAt < new Date()) {
    return {
      label: "In corso",
      className:
        "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
    };
  }

  return {
    label: "In programma",
    className: "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50",
  };
};

export default function TrainerDashboardShell() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, loading, activeClub, signOut } = useAuth();
  const [pageLoading, setPageLoading] = useState(true);
  const [trainerProfile, setTrainerProfile] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [trainings, setTrainings] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user?.id) {
      router.replace("/login");
      return;
    }

    if (!activeClub?.id) {
      router.replace("/account");
    }
  }, [activeClub?.id, loading, router, user?.id]);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!activeClub?.id || !user?.id) {
        setPageLoading(false);
        return;
      }

      setPageLoading(true);

      try {
        const [rawCategories, rawTrainers, rawStaff, rawAthletes, rawTrainings, rawMatches] =
          await Promise.all([
            getClubData(activeClub.id, "categories"),
            getClubData(activeClub.id, "trainers"),
            getClubData(activeClub.id, "staff_members"),
            getClubAthletes(activeClub.id),
            getClubData(activeClub.id, "trainings"),
            getClubData(activeClub.id, "matches"),
          ]);

        const normalizedCategories = (Array.isArray(rawCategories) ? rawCategories : [])
          .map((category: any) => ({
            id: String(category?.id || "").trim(),
            name: String(category?.name || "").trim(),
          }))
          .filter((category: any) => category.id && category.name);

        const trainerPool = [
          ...(Array.isArray(rawTrainers) ? rawTrainers : []),
          ...(Array.isArray(rawStaff) ? rawStaff : []).filter((staff: any) =>
            ["trainer", "allenatore"].includes(normalizeValue(staff?.role)),
          ),
        ];

        const normalizedTrainer = trainerPool
          .map((trainer: any) => ({
            ...trainer,
            name: getTrainerDisplayName(trainer),
            email: String(trainer?.email || "").trim(),
            linkedUserId:
              String(trainer?.linkedUserId || trainer?.linked_user_id || "").trim() ||
              null,
            categories: normalizeTrainerCategories(trainer?.categories, normalizedCategories),
          }))
          .find(
            (trainer: any) =>
              normalizeValue(trainer.linkedUserId) === normalizeValue(user.id) ||
              normalizeValue(trainer.email) === normalizeValue(user.email),
          );

        setTrainerProfile(normalizedTrainer || null);
        setCategories(normalizedCategories);
        setAthletes(Array.isArray(rawAthletes) ? rawAthletes : []);
        setTrainings(Array.isArray(rawTrainings) ? rawTrainings : []);
        setMatches(Array.isArray(rawMatches) ? rawMatches : []);
      } catch (error) {
        console.error("Error loading trainer dashboard:", error);
        showToast("error", "Errore nel caricamento della dashboard allenatore");
      } finally {
        setPageLoading(false);
      }
    };

    void loadDashboard();
  }, [activeClub?.id, showToast, user?.email, user?.id]);

  const categoryIds = useMemo(
    () => new Set(getTrainerCategoryIds(trainerProfile?.categories, categories)),
    [categories, trainerProfile?.categories],
  );

  const assignedAthletes = useMemo(
    () =>
      athletes.filter((athlete: any) => {
        const athleteCategoryId = String(
          athlete?.data?.category || athlete?.category_id || "",
        ).trim();
        const athleteCategoryName = String(
          athlete?.category_name || athlete?.data?.categoryName || "",
        ).trim();

        return (
          categoryIds.has(athleteCategoryId) ||
          categories.some(
            (category) =>
              categoryIds.has(category.id) &&
              normalizeValue(category.name) === normalizeValue(athleteCategoryName),
          )
        );
      }),
    [athletes, categories, categoryIds],
  );

  const visibleTrainings = useMemo(
    () =>
      trainings
        .filter((training: any) => {
          const trainerIds = Array.isArray(training?.trainerIds)
            ? training.trainerIds.map((value: any) => normalizeValue(value))
            : [];
          const trainerNames = String(training?.trainer || "")
            .split(",")
            .map((value) => normalizeValue(value))
            .filter(Boolean);
          const trainingCategoryIds = Array.isArray(training?.categories)
            ? training.categories.map((value: any) => String(value).trim())
            : [
                String(training?.categoryId || "").trim(),
                ...String(training?.category || "")
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean)
                  .map((value) =>
                    categories.find(
                      (category) =>
                        normalizeValue(category.name) === normalizeValue(value),
                    )?.id || value,
                  ),
              ].filter(Boolean);

          return (
            trainerIds.includes(normalizeValue(trainerProfile?.id)) ||
            trainerNames.includes(normalizeValue(trainerProfile?.name)) ||
            trainingCategoryIds.some((categoryId) => categoryIds.has(categoryId))
          );
        })
        .map((training: any) => ({
          ...training,
          startsAt: toDateTime(training?.date, training?.time),
        }))
        .filter((training: any) => training.startsAt && training.startsAt >= new Date())
        .sort((left: any, right: any) => left.startsAt.getTime() - right.startsAt.getTime())
        .slice(0, 6),
    [categoryIds, trainerProfile?.id, trainerProfile?.name, trainings],
  );

  const visibleMatches = useMemo(
    () =>
      matches
        .filter((match: any) => {
          const matchTrainers = Array.isArray(match?.trainers)
            ? match.trainers.map((value: any) => normalizeValue(value))
            : [];
          const categoryId =
            String(match?.categoryId || "").trim() ||
            categories.find(
              (category) =>
                normalizeValue(category.name) === normalizeValue(match?.category),
            )?.id ||
            "";

          return (
            matchTrainers.includes(normalizeValue(trainerProfile?.name)) ||
            categoryIds.has(categoryId)
          );
        })
        .map((match: any) => ({
          ...match,
          startsAt: toDateTime(match?.date, match?.time),
        }))
        .filter((match: any) => match.startsAt && match.startsAt >= new Date())
        .sort((left: any, right: any) => left.startsAt.getTime() - right.startsAt.getTime())
        .slice(0, 4),
    [categoryIds, matches, trainerProfile?.name],
  );

  if (loading || pageLoading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_42%),linear-gradient(180deg,#f7fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center rounded-[32px] border border-white/70 bg-white/85 shadow-2xl backdrop-blur">
          <div className="flex items-center gap-3 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin" />
            Caricamento dashboard allenatore...
          </div>
        </div>
      </div>
    );
  }

  if (!user?.id || !activeClub?.id) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.18),_transparent_42%),linear-gradient(180deg,#f7fbff_0%,#eef4ff_45%,#f8fafc_100%)] px-4 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[34px] border border-white/70 bg-white/80 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-5 border-b border-slate-100 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg">
                <Image src={EASYGAME_LOGO} alt="EasyGame" width={42} height={42} className="object-contain" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-blue-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Dashboard Allenatore
                </div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  Bentornato, {trainerProfile?.name || user.user_metadata?.name || "Allenatore"}
                </h1>
                <p className="text-sm text-slate-500">
                  Club attivo: <span className="font-medium text-slate-700">{activeClub.name || "Club"}</span>
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" className="rounded-full border-slate-200 bg-white" onClick={() => router.push("/account")}>
                <UserCircle2 className="mr-2 h-4 w-4" />
                Home account
              </Button>
              <Button variant="outline" className="rounded-full border-slate-200 bg-white" onClick={() => { void signOut(); }}>
                <LogOut className="mr-2 h-4 w-4" />
                Esci
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4 px-6 py-5">
            <Avatar className="h-16 w-16 border border-slate-200 shadow-sm">
              <AvatarImage src={trainerProfile?.avatar || undefined} alt={trainerProfile?.name || "Allenatore"} />
              <AvatarFallback className="bg-blue-100 text-blue-700">
                {getInitials(trainerProfile?.name || "Allenatore")}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="text-lg font-semibold text-slate-900">
                {trainerProfile?.name || "Profilo allenatore non collegato"}
              </p>
              <p className="text-sm text-slate-500">{trainerProfile?.email || user.email || "-"}</p>
            </div>
          </div>
        </div>

        {!trainerProfile ? (
          <Card className="rounded-[30px] border border-amber-200 bg-white/90">
            <CardContent className="px-6 py-8 text-sm text-slate-600">
              Il tuo accesso al club e attivo, ma non trovo ancora una scheda allenatore collegata a questo account.
              Chiedi al club di generare il token dalla tua scheda allenatore e riscattalo dalla home account.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="flex items-center gap-4 p-6"><ShieldCheck className="h-5 w-5 text-blue-600" /><div><p className="text-sm text-slate-500">Categorie</p><p className="text-2xl font-semibold text-slate-900">{categoryIds.size}</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-4 p-6"><Users className="h-5 w-5 text-emerald-600" /><div><p className="text-sm text-slate-500">Atleti seguiti</p><p className="text-2xl font-semibold text-slate-900">{assignedAthletes.length}</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-4 p-6"><Dumbbell className="h-5 w-5 text-indigo-600" /><div><p className="text-sm text-slate-500">Allenamenti</p><p className="text-2xl font-semibold text-slate-900">{visibleTrainings.length}</p></div></CardContent></Card>
              <Card><CardContent className="flex items-center gap-4 p-6"><Trophy className="h-5 w-5 text-amber-600" /><div><p className="text-sm text-slate-500">Gare</p><p className="text-2xl font-semibold text-slate-900">{visibleMatches.length}</p></div></CardContent></Card>
            </div>

            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[30px] border-white/70 bg-white/90">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-blue-600" />Prossimi allenamenti</CardTitle>
                  <Button variant="outline" onClick={() => router.push("/training")}>Apri allenamenti</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleTrainings.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Nessun allenamento in agenda per le tue categorie.</div> : visibleTrainings.map((training: any) => {
                    const status = getStatusBadge(training?.status, training?.startsAt);
                    return (
                      <div key={training.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <p className="text-base font-semibold text-slate-900">{training.title || "Allenamento"}</p>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(training.date)}</span>
                              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{String(training.time || "").slice(0, 5)}{training.endTime ? ` - ${String(training.endTime).slice(0, 5)}` : ""}</span>
                              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{training.location || "Campo"}</span>
                            </div>
                          </div>
                          <Badge className={status.className}>{status.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card className="rounded-[30px] border-white/70 bg-white/90">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-600" />Prossime gare</CardTitle>
                  <Button variant="outline" onClick={() => router.push("/matches")}>Apri gare</Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleMatches.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">Nessuna gara programmata.</div> : visibleMatches.map((match: any) => {
                    const status = getStatusBadge(match?.status, match?.startsAt);
                    return (
                      <div key={match.id} className="rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2">
                            <p className="text-base font-semibold text-slate-900">{match.title || "Gara"}</p>
                            <p className="text-sm text-slate-500">vs {match.opponent || "Avversario"}</p>
                            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" />{formatDate(match.date)}</span>
                              <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4" />{String(match.time || "").slice(0, 5) || "-"}</span>
                              <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4" />{match.location || "Da definire"}</span>
                            </div>
                          </div>
                          <Badge className={status.className}>{status.label}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

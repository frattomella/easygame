"use client";

import React, { memo, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "@/lib/utils";
import { memoize } from "@/lib/performance";
import {
  Activity,
  Calendar,
  CheckCircle,
  Clock,
  User,
  UserPlus,
} from "lucide-react";

interface ActivityItem {
  id: string;
  type: "registration" | "certificate" | "training" | "category" | "status";
  title: string;
  description: string;
  timestamp: string;
  user?: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
  className?: string;
  isLoading?: boolean;
  organizationId?: string | null;
  showEmptyState?: boolean;
}

const RecentActivity = memo(
  ({
    activities = [],
    className,
    isLoading = false,
    organizationId = null,
    showEmptyState = false,
  }: RecentActivityProps) => {
    // Memoize display activities
    const displayActivities = useMemo(
      () => (showEmptyState ? [] : activities),
      [showEmptyState, activities],
    );

    // Memoize icon getter function
    const getActivityIcon = useMemo(
      () =>
        memoize((type: ActivityItem["type"]) => {
          switch (type) {
            case "registration":
              return <UserPlus className="h-4 w-4 text-blue-500" />;
            case "certificate":
              return <CheckCircle className="h-4 w-4 text-green-500" />;
            case "training":
              return <Calendar className="h-4 w-4 text-purple-500" />;
            case "category":
              return <User className="h-4 w-4 text-orange-500" />;
            case "status":
              return <Activity className="h-4 w-4 text-yellow-500" />;
            default:
              return <Clock className="h-4 w-4 text-gray-500" />;
          }
        }),
      [],
    );

    return (
      <Card className={cn("h-full bg-white dark:bg-gray-800 shadow-md border-0", className)}>
        <CardHeader className="border-b border-gray-100 dark:border-gray-700">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            Attività Recenti
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-auto max-h-[320px] pt-4">
          <div className="space-y-5">
            {displayActivities.length > 0 ? (
              displayActivities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  getIcon={getActivityIcon}
                />
              ))
            ) : (
              <EmptyState />
            )}
          </div>
        </CardContent>
      </Card>
    );
  },
);

RecentActivity.displayName = "RecentActivity";

// Memoized activity item component
const ActivityItem = memo(
  ({
    activity,
    getIcon,
  }: {
    activity: ActivityItem;
    getIcon: (type: ActivityItem["type"]) => React.ReactNode;
  }) => (
    <div className="flex items-start space-x-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
      <div className="flex-shrink-0 mt-1 p-2 rounded-full bg-gradient-to-r from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900">
        {getIcon(activity.type)}
      </div>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">{activity.title}</p>
        <p className="text-sm text-muted-foreground">{activity.description}</p>
        <div className="flex items-center text-xs text-muted-foreground">
          <span>{activity.timestamp}</span>
          {activity.user && (
            <>
              <span className="mx-1">•</span>
              <span>{activity.user}</span>
            </>
          )}
        </div>
      </div>
    </div>
  ),
);

ActivityItem.displayName = "ActivityItem";

// Memoized empty state component
const EmptyState = memo(() => (
  <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500">
    <Activity className="h-12 w-12 mb-2 opacity-50" />
    <p className="font-medium">Nessuna attività recente</p>
    <p className="text-sm">Le attività del club appariranno qui</p>
  </div>
));

EmptyState.displayName = "EmptyState";

export default RecentActivity;

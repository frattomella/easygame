"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";

export interface ContainerStatusProps {
  onRefresh?: () => void;
  initialStatus?: "running" | "stopped" | "error" | "loading";
}

export function ContainerStatus({
  onRefresh = () => {},
  initialStatus = "loading",
}: ContainerStatusProps) {
  const [status, setStatus] = useState<
    "running" | "stopped" | "error" | "loading"
  >(initialStatus);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Simulate checking container status
    const checkStatus = async () => {
      setStatus("loading");

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // For demo purposes, set to running
      setStatus("running");
    };

    checkStatus();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    onRefresh();

    // Simulate refresh
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setStatus("running");
    setIsRefreshing(false);
  };

  return (
    <Card className="w-full bg-white dark:bg-gray-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Container Status</span>
          {status === "running" && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
              Running
            </Badge>
          )}
          {status === "stopped" && (
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
              Stopped
            </Badge>
          )}
          {status === "error" && (
            <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100">
              Error
            </Badge>
          )}
          {status === "loading" && (
            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
              Checking...
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-center p-6">
            {status === "running" && (
              <div className="flex flex-col items-center text-center">
                <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                <p className="text-lg font-medium">
                  Container is running properly
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  All systems operational
                </p>
              </div>
            )}
            {status === "stopped" && (
              <div className="flex flex-col items-center text-center">
                <AlertCircle className="h-16 w-16 text-amber-500 mb-4" />
                <p className="text-lg font-medium">Container is stopped</p>
                <p className="text-sm text-muted-foreground mt-1">
                  The container needs to be restarted
                </p>
              </div>
            )}
            {status === "error" && (
              <div className="flex flex-col items-center text-center">
                <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
                <p className="text-lg font-medium">Container error detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Error code: 409 - Container is not running
                </p>
              </div>
            )}
            {status === "loading" && (
              <div className="flex flex-col items-center text-center">
                <RefreshCw className="h-16 w-16 text-blue-500 mb-4 animate-spin" />
                <p className="text-lg font-medium">Checking container status</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Please wait...
                </p>
              </div>
            )}
          </div>

          <Button
            onClick={handleRefresh}
            disabled={isRefreshing || status === "loading"}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isRefreshing ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Restarting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Restart Container
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ContainerStatus } from "@/components/ui/container-status";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Server,
  Database,
  Code,
} from "lucide-react";

export function SystemDiagnostics() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleSystemRefresh = async () => {
    setIsRefreshing(true);
    // Simulate system refresh
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsRefreshing(false);
  };

  return (
    <Card className="w-full bg-white dark:bg-gray-950">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-primary" />
          System Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="container">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="container">Container</TabsTrigger>
            <TabsTrigger value="database">Database</TabsTrigger>
            <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
          </TabsList>

          <TabsContent value="container" className="space-y-4 mt-4">
            <ContainerStatus
              onRefresh={handleSystemRefresh}
              initialStatus="error"
            />
          </TabsContent>

          <TabsContent value="database" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Database Connection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-center p-6">
                    <div className="flex flex-col items-center text-center">
                      <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                      <p className="text-lg font-medium">
                        Database is connected
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Using development database
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dependencies" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  Package Dependencies
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-center p-6">
                    <div className="flex flex-col items-center text-center">
                      <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
                      <p className="text-lg font-medium">
                        All dependencies installed
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        tempo-devtools@latest is properly configured
                      </p>
                    </div>
                  </div>

                  <Button
                    onClick={handleSystemRefresh}
                    disabled={isRefreshing}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {isRefreshing ? (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                        Checking dependencies...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Verify Dependencies
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

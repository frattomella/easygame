"use client";

import React from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Bell,
  Calendar,
  FileHeart,
  UserPlus,
  Settings,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/use-toast";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "certificate" | "training" | "registration" | "system";
  date: string;
  read: boolean;
  created_at?: string;
  user_id?: string;
  data?: any;
}

export default function NotificationsPage() {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState("all");
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [loading, setLoading] = React.useState(true);
  const { toast } = useToast();
  const loadedRef = React.useRef(false);

  // Load notifications only once on mount
  React.useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    const initializeNotifications = async () => {
      try {
        await loadNotifications();
      } catch (error) {
        console.error("Error initializing notifications:", error);
      }
    };

    initializeNotifications();

    // Set up real-time subscription for new notifications
    const subscription = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "simplified_notifications",
        },
        (payload) => {
          console.log("New notification received:", payload);
          loadNotifications();
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadNotifications = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        console.error("Error getting user:", userError);
        return;
      }

      // Get club ID from localStorage only once
      const activeClubData = localStorage.getItem("activeClub");
      if (!activeClubData) {
        console.log("No active club found in localStorage");
      }

      const { data: notificationsData, error } = await supabase
        .from("simplified_notifications")
        .select("*")
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error loading notifications:", error);
      }

      const transformedNotifications = (notificationsData || []).map(
        (notification) => ({
          id: notification.id,
          title: notification.title,
          message: notification.message,
          type: notification.type as
            | "certificate"
            | "training"
            | "registration"
            | "system",
          date: notification.created_at || new Date().toISOString(),
          read: notification.read || false,
          created_at: notification.created_at,
          user_id: notification.user_id,
          data: notification.data,
        }),
      );

      const sixDaysAgo = new Date();
      sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

      const recentNotifications = transformedNotifications.filter(
        (notification) => new Date(notification.date) >= sixDaysAgo,
      );

      setNotifications(recentNotifications);
    } catch (error) {
      console.error("Error loading notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "certificate":
        return <FileHeart className="h-5 w-5 text-red-500" />;
      case "training":
        return <Calendar className="h-5 w-5 text-blue-500" />;
      case "registration":
        return <UserPlus className="h-5 w-5 text-green-500" />;
      case "system":
        return <Settings className="h-5 w-5 text-purple-500" />;
      default:
        return <Bell className="h-5 w-5 text-gray-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Oggi, ${date.toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    } else if (diffDays === 1) {
      return "Ieri";
    } else if (diffDays < 7) {
      return date.toLocaleDateString("it-IT", { weekday: "long" });
    } else {
      return date.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const { error } = await supabase
        .from("simplified_notifications")
        .update({ read: true })
        .eq("id", id);

      if (error) {
        console.error("Error marking notification as read:", error);
        return;
      }

      setNotifications(
        notifications.map((notification) =>
          notification.id === id
            ? { ...notification, read: true }
            : notification,
        ),
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("simplified_notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false);

      if (error) {
        console.error("Error marking all notifications as read:", error);
        return;
      }

      setNotifications(
        notifications.map((notification) => ({ ...notification, read: true })),
      );
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };

  const filteredNotifications = notifications
    .filter(
      (notification) =>
        notification.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        notification.message.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((notification) => {
      if (activeTab === "all") return true;
      if (activeTab === "unread") return !notification.read;
      return notification.type === activeTab;
    });

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="Notifiche" />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="mx-auto max-w-9xl space-y-6">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Notifiche
              </h1>
              <p className="text-gray-600 mt-2">
                Consulta e gestisci le notifiche del tuo club.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="relative w-full sm:w-auto">
                <Input
                  placeholder="Cerca notifiche..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-80"
                />
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={markAllAsRead}
                disabled={!notifications.some((n) => !n.read)}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Segna tutte come lette
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-0">
                <Tabs defaultValue="all" onValueChange={setActiveTab}>
                  <TabsList>
                    <TabsTrigger value="all">Tutte</TabsTrigger>
                    <TabsTrigger value="unread">
                      Non lette
                      {notifications.filter((n) => !n.read).length > 0 && (
                        <Badge className="ml-2 bg-blue-600">
                          {notifications.filter((n) => !n.read).length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="certificate">Certificati</TabsTrigger>
                    <TabsTrigger value="training">Allenamenti</TabsTrigger>
                    <TabsTrigger value="registration">
                      Registrazioni
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="pt-6">
                {loading ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2">Caricamento notifiche...</span>
                  </div>
                ) : filteredNotifications.length > 0 ? (
                  <div className="space-y-4">
                    {filteredNotifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 border rounded-lg ${!notification.read ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" : ""}`}
                      >
                        <div className="flex items-start gap-4">
                          <div className="mt-1">
                            {getTypeIcon(notification.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className="font-medium">
                                {notification.title}
                              </h4>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(notification.date)}
                              </span>
                            </div>
                            <p className="text-sm mt-1">
                              {notification.message}
                            </p>
                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-0 h-auto"
                                onClick={() => markAsRead(notification.id)}
                              >
                                Segna come letta
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Bell className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-4" />
                    <h3 className="text-lg font-medium">
                      Nessuna notifica trovata
                    </h3>
                    <p className="text-muted-foreground">
                      Non ci sono notifiche che corrispondono ai tuoi filtri
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}

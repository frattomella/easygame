"use client";

import React, { useState, useEffect } from "react";
import { Bell, FileHeart, Calendar, UserPlus, Settings, ArrowRight } from "lucide-react";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "certificate" | "training" | "registration" | "system";
  date: string;
  read: boolean;
  created_at?: string;
}

interface NotificationsDropdownProps {
  notificationCount?: number;
}

export function NotificationsDropdown({ notificationCount = 0 }: NotificationsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: notificationsData, error } = await supabase
        .from('simplified_notifications')
        .select('*')
        .or(`user_id.eq.${user.id},user_id.is.null`)
        .order('created_at', { ascending: false })
        .limit(6);

      if (error) {
        console.error('Error loading notifications:', error);
        return;
      }

      const transformedNotifications = (notificationsData || []).map(notification => ({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        type: notification.type as "certificate" | "training" | "registration" | "system",
        date: notification.created_at || new Date().toISOString(),
        read: notification.read || false,
        created_at: notification.created_at
      }));

      setNotifications(transformedNotifications);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "certificate":
        return <FileHeart className="h-4 w-4 text-red-500" />;
      case "training":
        return <Calendar className="h-4 w-4 text-blue-500" />;
      case "registration":
        return <UserPlus className="h-4 w-4 text-green-500" />;
      case "system":
        return <Settings className="h-4 w-4 text-purple-500" />;
      default:
        return <Bell className="h-4 w-4 text-gray-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffMinutes = Math.floor(diffTime / (1000 * 60));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffMinutes < 60) {
      return `${diffMinutes}m fa`;
    } else if (diffHours < 24) {
      return `${diffHours}h fa`;
    } else if (diffDays === 1) {
      return "Ieri";
    } else if (diffDays < 7) {
      return `${diffDays}g fa`;
    } else {
      return date.toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
      });
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await supabase
        .from('simplified_notifications')
        .update({ read: true })
        .eq('id', id);

      setNotifications(
        notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification
        )
      );
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const handleViewAll = () => {
    setIsOpen(false);
    router.push('/notifications');
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifiche"
        title="Visualizza notifiche"
      >
        <Bell className="h-5 w-5" />
        {notificationCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-medium text-destructive-foreground">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <Card className="absolute right-0 top-12 z-50 w-96 max-h-[500px] shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Notifiche</span>
                {notificationCount > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">
                    {notificationCount} non {notificationCount === 1 ? 'letta' : 'lette'}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex justify-center items-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                </div>
              ) : notifications.length > 0 ? (
                <div className="max-h-[350px] overflow-y-auto">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 border-b last:border-b-0 hover:bg-accent cursor-pointer transition-colors ${
                        !notification.read ? "bg-blue-50 dark:bg-blue-900/20" : ""
                      }`}
                      onClick={() => markAsRead(notification.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          {getTypeIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start gap-2">
                            <h4 className="font-medium text-sm truncate">
                              {notification.title}
                            </h4>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {formatDate(notification.date)}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 px-4">
                  <Bell className="h-8 w-8 mx-auto text-muted-foreground opacity-50 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Nessuna notifica
                  </p>
                </div>
              )}
              
              <div className="p-3 border-t">
                <Button
                  variant="ghost"
                  className="w-full justify-center text-sm"
                  onClick={handleViewAll}
                >
                  Vedi tutte le notifiche
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

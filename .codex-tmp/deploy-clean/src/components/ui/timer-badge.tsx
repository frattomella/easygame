import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

interface TimerBadgeProps {
  expiryTime: Date;
  onExpire?: () => void;
  className?: string;
}

export function TimerBadge({
  expiryTime,
  onExpire,
  className = "",
}: TimerBadgeProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [expired, setExpired] = useState<boolean>(false);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const difference = expiryTime.getTime() - now.getTime();

      if (difference <= 0) {
        setTimeLeft(0);
        setExpired(true);
        if (onExpire) onExpire();
        return;
      }

      setTimeLeft(Math.floor(difference / 1000));
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(timer);
  }, [expiryTime, onExpire]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
  };

  if (expired) {
    return (
      <Badge variant="destructive" className={className}>
        <Clock className="h-3 w-3 mr-1" />
        Scaduto
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`${className} ${timeLeft < 30 ? "border-red-500 text-red-500 animate-pulse" : "border-amber-500 text-amber-500"}`}
    >
      <Clock className="h-3 w-3 mr-1" />
      {formatTime(timeLeft)}
    </Badge>
  );
}

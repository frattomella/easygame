"use client";

/* import { TempoDevtools } from 'tempo-devtools'; [deprecated] */
import { useEffect } from "react";

export function TempoInit() {
  useEffect(() => {
    if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_TEMPO) {
      console.log("Initializing Tempo Devtools");
      try {
        /* TempoDevtools.init() [deprecated] */;
      } catch (error) {
        console.error("Error initializing Tempo Devtools:", error);
      }
    }
  }, []);

  return null;
}

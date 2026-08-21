/* import { TempoDevtools } from 'tempo-devtools'; [deprecated] */
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/toast-notification";
import type { AppProps } from "next/app";

export default function App({ Component, pageProps }: AppProps) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_TEMPO) {
      /* TempoDevtools.init() [deprecated] */;
    }
  }, []);

  return (
    <ToastProvider>
      <Component {...pageProps} />
    </ToastProvider>
  );
}

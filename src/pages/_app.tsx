import { AppProps } from "next/app";
/* import { TempoDevtools } from 'tempo-devtools'; [deprecated] */
import { useEffect } from "react";
import { ToastProvider } from "@/components/ui/toast-notification";

export default function App({ Component, pageProps }) {
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

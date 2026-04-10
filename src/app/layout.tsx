import "./globals.css";
import { AppClientProviders } from "@/components/providers/AppClientProviders";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="it" className="light" suppressHydrationWarning>
      <head suppressHydrationWarning />
      <body className="bg-slate-50 text-slate-900" suppressHydrationWarning>
        <AppClientProviders>{children}</AppClientProviders>
      </body>
    </html>
  );
}

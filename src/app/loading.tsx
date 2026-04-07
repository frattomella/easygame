import { AppLoadingScreen } from "@/components/ui/app-loading-screen";

export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <AppLoadingScreen subtitle="Caricamento pagina in corso..." />
      </div>
    </div>
  );
}

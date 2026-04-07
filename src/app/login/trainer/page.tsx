"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast-notification";
import Image from "next/image";
import Link from "next/link";
import { AppBackButton } from "@/components/navigation/AppBackButton";

export default function TrainerLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // In a real app, this would authenticate with the backend
      // For now, we'll simulate a successful login
      if (email && password) {
        // Simulate successful login
        setTimeout(() => {
          showToast("success", "Login effettuato con successo!");
          router.push("/trainer-dashboard");
        }, 1000);
      } else {
        throw new Error("Inserisci email e password");
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "Credenziali non valide. Riprova.");
      showToast(
        "error",
        `Errore: ${err.message || "Credenziali non valide. Riprova."}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-indigo-700 flex flex-col">
      {/* Header */}
      <header className="container mx-auto py-4 px-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <AppBackButton fallbackHref="/" className="border-white/30 bg-white text-blue-600 hover:bg-blue-50" />
          <div className="rounded-md bg-white p-2 relative h-10 w-10">
            <Image
              src="/logo.png"
              alt="EasyGame Logo"
              fill
              className="object-contain"
            />
          </div>
          <h1 className="text-xl font-bold text-white">EasyGame</h1>
        </div>
        <Link href="/">
          <Button
            variant="outline"
            className="bg-white text-blue-600 hover:bg-blue-50"
          >
            Home
          </Button>
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold">Accesso Allenatori</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Accedi con le credenziali fornite dalla tua società
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nome@esempio.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a href="#" className="text-sm text-blue-600 hover:underline">
                  Password dimenticata?
                </a>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Accesso in corso...
                </>
              ) : (
                "Accedi"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>
              Per ottenere le credenziali di accesso, contatta la tua società
              sportiva.
            </p>
          </div>
        </div>
      </div>

      <footer className="bg-gray-800 text-white py-4">
        <div className="container mx-auto px-4 text-center text-sm">
          © 2024 EasyGame. Tutti i diritti riservati.
        </div>
      </footer>
    </div>
  );
}

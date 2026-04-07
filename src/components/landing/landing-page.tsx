"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoginForm } from "./login-form";
import { RegisterForm } from "./register-form";
import { CheckCircle, Star } from "lucide-react";

export function LandingPage() {
  return <AuthShell defaultMode="login" />;

  const router = useRouter();

  // Function to show login section when Accedi button is clicked
  const showLoginSection = () => {
    const loginSection = document.getElementById("login-section");
    if (loginSection) {
      loginSection.classList.remove("hidden");
      loginSection.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 py-4 px-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img
              src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
              alt="EasyGame Logo"
              className="h-10 w-10 object-contain"
            />
            <h1 className="text-xl font-bold text-white">EasyGame</h1>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="bg-white text-blue-600 hover:bg-blue-50"
              onClick={showLoginSection}
            >
              Accedi
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-blue-600 to-indigo-700 py-16 px-4">
        <div className="container mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              Gestisci la tua associazione sportiva con semplicità
            </h1>
            <p className="text-xl text-blue-100">
              Una piattaforma completa per associazioni sportive, allenatori e
              genitori. Gestisci atleti, categorie, allenamenti e comunicazioni
              in un unico posto.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button
                className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-6 text-lg"
                onClick={showLoginSection}
              >
                Inizia Gratis
              </Button>
            </div>
          </div>

          <div className="relative h-[400px] rounded-xl overflow-hidden shadow-2xl hidden md:block bg-blue-500">
            <img
              src="https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=800&q=80"
              alt="Sports Management"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Subscription Plans */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Piani di Abbonamento
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Scegli il piano più adatto alle esigenze della tua associazione
              sportiva
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Trial Plan */}
            <Card className="border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300 flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    Prova Gratuita
                  </h3>
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    €0
                  </div>
                  <p className="text-gray-500">per 15 giorni</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Gestione base degli atleti</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Calendario allenamenti</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Gestione categorie</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Accesso per 1 allenatore</span>
                  </li>
                </ul>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={showLoginSection}
                >
                  Inizia Gratis
                </Button>
              </CardContent>
            </Card>

            {/* Monthly Plan */}
            <Card className="border-2 border-blue-500 hover:shadow-xl transition-all duration-300 flex flex-col relative">
              <div className="absolute top-0 right-0 bg-blue-500 text-white px-3 py-1 text-sm font-medium rounded-bl-lg">
                Popolare
              </div>
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    Mensile
                  </h3>
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    €29.99
                  </div>
                  <p className="text-gray-500">al mese</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Gestione completa degli atleti</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Calendario avanzato</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Gestione certificati medici</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Accesso per 5 allenatori</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Gestione pagamenti</span>
                  </li>
                </ul>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={showLoginSection}
                >
                  Abbonati Ora
                </Button>
              </CardContent>
            </Card>

            {/* Annual Plan */}
            <Card className="border-2 border-gray-200 hover:border-blue-400 hover:shadow-lg transition-all duration-300 flex flex-col">
              <CardContent className="p-6 flex-1 flex flex-col">
                <div className="text-center mb-6">
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    Annuale
                  </h3>
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    €249.99
                  </div>
                  <p className="text-gray-500">all'anno (risparmia 20%)</p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Tutte le funzionalità del piano mensile</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Accesso per 10 allenatori</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Reportistica avanzata</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Supporto prioritario</span>
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                    <span>Backup dati automatici</span>
                  </li>
                </ul>

                <Button
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  onClick={showLoginSection}
                >
                  Risparmia con l'Annuale
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section with Images */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Funzionalità Principali
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Tutto ciò di cui hai bisogno per gestire la tua associazione
              sportiva in un'unica piattaforma
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="relative h-[400px] rounded-xl overflow-hidden shadow-lg bg-gray-200">
              <img
                src="https://images.unsplash.com/photo-1576280314498-31e7c48af58f?w=800&q=80"
                alt="Gestione Atleti"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-gray-800">
                Gestione Atleti Completa
              </h3>
              <p className="text-lg text-gray-600">
                Organizza facilmente tutti i dati dei tuoi atleti in un unico
                posto. Tieni traccia delle informazioni personali, certificati
                medici, presenze e pagamenti.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Schede atleti dettagliate con foto e contatti</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Monitoraggio scadenze certificati medici</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Gestione categorie e gruppi di allenamento</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center mb-20">
            <div className="space-y-6 order-2 md:order-1">
              <h3 className="text-2xl font-bold text-gray-800">
                Calendario e Presenze
              </h3>
              <p className="text-lg text-gray-600">
                Pianifica allenamenti, partite ed eventi con un calendario
                intuitivo. Registra le presenze degli atleti e monitora la
                partecipazione nel tempo.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Calendario visuale con filtri per categoria</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Appelli digitali con un click</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Statistiche di partecipazione</span>
                </li>
              </ul>
            </div>
            <div className="relative h-[400px] rounded-xl overflow-hidden shadow-lg order-1 md:order-2 bg-gray-200">
              <img
                src="https://images.unsplash.com/photo-1590556409324-aa1d726e5c3c?w=800&q=80"
                alt="Calendario e Presenze"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="relative h-[400px] rounded-xl overflow-hidden shadow-lg bg-gray-200">
              <img
                src="https://images.unsplash.com/photo-1551836022-deb4988cc6c0?w=800&q=80"
                alt="Gestione Pagamenti"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-gray-800">
                Gestione Pagamenti
              </h3>
              <p className="text-lg text-gray-600">
                Tieni traccia delle quote associative, genera ricevute e
                monitora i pagamenti in sospeso. Semplifica la gestione
                amministrativa del tuo club.
              </p>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Registrazione pagamenti con ricevute automatiche</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Promemoria per pagamenti in scadenza</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Report finanziari dettagliati</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              Cosa Dicono i Nostri Clienti
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Scopri come EasyGame ha aiutato altre associazioni sportive a
              crescere e migliorare
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Testimonial 1 */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-5 w-5 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-gray-700 mb-6">
                  "EasyGame ha rivoluzionato la gestione della nostra
                  polisportiva. Prima impiegavamo ore per organizzare
                  allenamenti e gestire i certificati, ora tutto è automatizzato
                  e accessibile in pochi click."
                </p>
                <div className="flex items-center">
                  <div className="relative h-12 w-12 rounded-full overflow-hidden mr-4 bg-gray-200">
                    <img
                      src="https://api.dicebear.com/7.x/avataaars/svg?seed=Marco"
                      alt="Marco Bianchi"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-semibold">Marco Bianchi</h4>
                    <p className="text-sm text-gray-500">
                      Presidente, Polisportiva Roma
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 2 */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-5 w-5 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-gray-700 mb-6">
                  "Come allenatrice, posso finalmente concentrarmi sul campo
                  anziché sulla burocrazia. L'app è intuitiva e mi permette di
                  gestire i miei gruppi di atleti in modo efficiente."
                </p>
                <div className="flex items-center">
                  <div className="relative h-12 w-12 rounded-full overflow-hidden mr-4 bg-gray-200">
                    <img
                      src="https://api.dicebear.com/7.x/avataaars/svg?seed=Laura"
                      alt="Laura Rossi"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-semibold">Laura Rossi</h4>
                    <p className="text-sm text-gray-500">
                      Allenatrice, Basket Milano
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Testimonial 3 */}
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-5 w-5 text-yellow-400 fill-yellow-400"
                    />
                  ))}
                </div>
                <p className="text-gray-700 mb-6">
                  "Come genitore, apprezzo molto poter vedere gli allenamenti di
                  mio figlio e ricevere notifiche sui pagamenti. La
                  comunicazione con la società è migliorata notevolmente."
                </p>
                <div className="flex items-center">
                  <div className="relative h-12 w-12 rounded-full overflow-hidden mr-4 bg-gray-200">
                    <img
                      src="https://api.dicebear.com/7.x/avataaars/svg?seed=Paolo"
                      alt="Paolo Verdi"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h4 className="font-semibold">Paolo Verdi</h4>
                    <p className="text-sm text-gray-500">
                      Genitore, Calcio Napoli Junior
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">
            Pronto a semplificare la gestione della tua associazione sportiva?
          </h2>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Inizia oggi con la prova gratuita di 15 giorni. Nessuna carta di
            credito richiesta.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              className="bg-white text-blue-600 hover:bg-blue-50 px-8 py-6 text-lg"
              onClick={showLoginSection}
            >
              Inizia Gratis
            </Button>
          </div>
        </div>
      </section>

      {/* Login/Register Section */}
      <section id="login-section" className="py-20 px-4 bg-white hidden">
        <div className="container mx-auto">
          <div className="max-w-md mx-auto">
            <Card className="shadow-xl border-0">
              <CardContent className="p-6">
                <Tabs defaultValue="login" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="login">Accedi</TabsTrigger>
                    <TabsTrigger value="register">Registrati</TabsTrigger>
                  </TabsList>
                  <TabsContent value="login">
                    <Suspense fallback={<div className="text-sm text-muted-foreground">Caricamento login...</div>}>
                      <LoginForm />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="register">
                    <Suspense fallback={<div className="text-sm text-muted-foreground">Caricamento registrazione...</div>}>
                      <RegisterForm />
                    </Suspense>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img
                  src="https://r2.fivemanage.com/LxmV791LM4K69ERXKQGHd/image/logo.png"
                  alt="EasyGame Logo"
                  className="h-8 w-8 object-contain"
                />
                <span className="font-semibold text-lg">EasyGame</span>
              </div>
              <p className="text-gray-400">
                La piattaforma completa per la gestione delle associazioni
                sportive.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Prodotto</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Funzionalità
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Prezzi
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Demo
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Aggiornamenti
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Supporto</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Documentazione
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Contatti
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Community
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Legale</h4>
              <ul className="space-y-2">
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Termini di Servizio
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-400 hover:text-white">
                    Cookie Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-8 mt-8 text-center text-sm text-gray-400">
            © 2023 EasyGame. Tutti i diritti riservati.
          </div>
        </div>
      </footer>
    </div>
  );
}

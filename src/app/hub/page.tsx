"use client";

import React, { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast-notification";
import {
  ShoppingBag,
  Sparkles,
  BookOpen,
  MessageSquare,
  Lightbulb,
  Star,
  Crown,
  Zap,
  Shield,
  BarChart3,
  Users,
  Calendar,
  FileText,
  Send,
  Play,
  ChevronRight,
  ExternalLink,
  Gift,
  Rocket,
  Heart,
  CheckCircle,
  HelpCircle,
  Mail,
} from "lucide-react";

// Marketplace items
const marketplaceItems = [
  {
    id: "premium-analytics",
    name: "Analytics Premium",
    description: "Report avanzati e statistiche dettagliate per il tuo club",
    price: "€9.99/mese",
    icon: BarChart3,
    color: "from-blue-500 to-cyan-500",
    popular: true,
    features: ["Report personalizzati", "Export PDF", "Grafici interattivi"],
  },
  {
    id: "multi-club",
    name: "Multi-Club Manager",
    description: "Gestisci più club da un'unica dashboard",
    price: "€19.99/mese",
    icon: Users,
    color: "from-purple-500 to-pink-500",
    popular: false,
    features: ["Fino a 5 club", "Dashboard unificata", "Report consolidati"],
  },
  {
    id: "advanced-calendar",
    name: "Calendario Avanzato",
    description: "Sincronizzazione con Google Calendar e notifiche push",
    price: "€4.99/mese",
    icon: Calendar,
    color: "from-green-500 to-emerald-500",
    popular: false,
    features: ["Sync Google Calendar", "Notifiche push", "Promemoria automatici"],
  },
  {
    id: "document-manager",
    name: "Document Manager Pro",
    description: "Gestione documenti avanzata con firma digitale",
    price: "€14.99/mese",
    icon: FileText,
    color: "from-orange-500 to-red-500",
    popular: true,
    features: ["Firma digitale", "Template personalizzati", "Archiviazione cloud"],
  },
];

// News items
const newsItems = [
  {
    id: 1,
    title: "Nuova funzionalità: Gestione Gare",
    date: "15 Gen 2025",
    description: "Abbiamo rilasciato la nuova sezione per la gestione completa delle gare e convocazioni.",
    type: "feature",
  },
  {
    id: 2,
    title: "Aggiornamento Dashboard",
    date: "10 Gen 2025",
    description: "La dashboard è stata completamente ridisegnata con nuovi widget e colori più vivaci.",
    type: "update",
  },
  {
    id: 3,
    title: "Miglioramenti Performance",
    date: "5 Gen 2025",
    description: "Abbiamo ottimizzato le performance dell'applicazione per un'esperienza più fluida.",
    type: "improvement",
  },
];

// Tutorial items
const tutorialItems = [
  {
    id: 1,
    title: "Come creare il tuo primo club",
    duration: "5 min",
    category: "Iniziare",
    thumbnail: "https://images.unsplash.com/photo-1461896836934- voices-of-the-game?w=400&q=80",
  },
  {
    id: 2,
    title: "Gestire gli atleti",
    duration: "8 min",
    category: "Atleti",
    thumbnail: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&q=80",
  },
  {
    id: 3,
    title: "Pianificare gli allenamenti",
    duration: "6 min",
    category: "Allenamenti",
    thumbnail: "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=400&q=80",
  },
  {
    id: 4,
    title: "Gestire i certificati medici",
    duration: "4 min",
    category: "Certificati",
    thumbnail: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&q=80",
  },
];

// FAQ items
const faqItems = [
  {
    question: "Come posso aggiungere un nuovo atleta?",
    answer: "Vai nella sezione Atleti dal menu laterale e clicca sul pulsante 'Nuovo Atleta'. Compila tutti i campi richiesti e salva.",
  },
  {
    question: "Come funziona il sistema di token per i genitori?",
    answer: "Ogni atleta ha un token univoco che può essere condiviso con i genitori. I genitori possono usare questo token per accedere alla loro area dedicata.",
  },
  {
    question: "Posso gestire più club con lo stesso account?",
    answer: "Sì! Puoi essere membro di più club con ruoli diversi. Usa il selettore club nella sidebar per passare da un club all'altro.",
  },
  {
    question: "Come ricevo le notifiche per i certificati in scadenza?",
    answer: "Le notifiche sono automatiche. Riceverai un avviso 30 giorni prima della scadenza di ogni certificato medico.",
  },
  {
    question: "Posso esportare i dati degli atleti?",
    answer: "Sì, dalla sezione Atleti puoi esportare i dati in formato CSV o PDF usando il pulsante di esportazione.",
  },
];

export default function HubPage() {
  const { showToast } = useToast();
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackType, setFeedbackType] = useState("feedback");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalDescription, setProposalDescription] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleSendFeedback = () => {
    if (!feedbackText.trim()) {
      showToast("error", "Inserisci un messaggio");
      return;
    }
    showToast("success", "Grazie per il tuo feedback! Lo esamineremo presto.");
    setFeedbackText("");
  };

  const handleSendProposal = () => {
    if (!proposalTitle.trim() || !proposalDescription.trim()) {
      showToast("error", "Compila tutti i campi");
      return;
    }
    showToast("success", "Proposta inviata con successo! Ti contatteremo presto.");
    setProposalTitle("");
    setProposalDescription("");
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title="EasyGame HUB" />
        <main className="flex-1 overflow-y-auto">
          {/* Hero Section */}
          <div className="relative bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white">
            <div className="absolute inset-0 bg-black/20"></div>
            <div className="relative px-6 pt-12 pb-32 md:pt-16 md:pb-40">
              <div className="max-w-4xl mx-auto text-center">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Sparkles className="h-8 w-8 animate-pulse" />
                  <h1 className="text-4xl md:text-5xl font-bold">EasyGame HUB</h1>
                  <Sparkles className="h-8 w-8 animate-pulse" />
                </div>
                <p className="text-xl md:text-2xl text-white/90 mb-8">
                  Il centro di tutto ciò che ti serve per gestire al meglio il tuo club
                </p>
                <div className="flex flex-wrap justify-center gap-4">
                  <Badge className="bg-white/30 backdrop-blur-sm text-white px-5 py-2.5 text-sm border border-white/40 shadow-lg">
                    <Gift className="h-4 w-4 mr-2" />
                    Marketplace
                  </Badge>
                  <Badge className="bg-white/30 backdrop-blur-sm text-white px-5 py-2.5 text-sm border border-white/40 shadow-lg">
                    <Rocket className="h-4 w-4 mr-2" />
                    Novità
                  </Badge>
                  <Badge className="bg-white/30 backdrop-blur-sm text-white px-5 py-2.5 text-sm border border-white/40 shadow-lg">
                    <BookOpen className="h-4 w-4 mr-2" />
                    Tutorial
                  </Badge>
                </div>
              </div>
            </div>
            {/* Decorative wave */}
            <div className="absolute bottom-0 left-0 right-0">
              <svg viewBox="0 0 1440 200" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" className="w-full h-24 md:h-32">
                <path
                  d="M0 200L60 175C120 150 240 100 360 75C480 50 600 50 720 62.5C840 75 960 100 1080 112.5C1200 125 1320 125 1380 125L1440 125V200H1380C1320 200 1200 200 1080 200C960 200 840 200 720 200C600 200 480 200 360 200C240 200 120 200 60 200H0Z"
                  className="fill-gray-50 dark:fill-gray-900"
                />
              </svg>
            </div>
          </div>

          {/* Main Content */}
          <div className="px-6 py-8 max-w-7xl mx-auto">
            <Tabs defaultValue="marketplace" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-5 gap-2 bg-transparent h-auto p-0">
                <TabsTrigger
                  value="marketplace"
                  className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white data-[state=active]:border-transparent py-3 rounded-lg"
                >
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Marketplace
                </TabsTrigger>
                <TabsTrigger
                  value="news"
                  className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white data-[state=active]:border-transparent py-3 rounded-lg"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Novità
                </TabsTrigger>
                <TabsTrigger
                  value="tutorials"
                  className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white data-[state=active]:border-transparent py-3 rounded-lg"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Tutorial & FAQ
                </TabsTrigger>
                <TabsTrigger
                  value="feedback"
                  className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white data-[state=active]:border-transparent py-3 rounded-lg"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Feedback
                </TabsTrigger>
                <TabsTrigger
                  value="proposals"
                  className="border border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800 data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:border-transparent py-3 rounded-lg"
                >
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Proposte
                </TabsTrigger>
              </TabsList>

              {/* Marketplace Tab */}
              <TabsContent value="marketplace" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Potenzia il tuo Club</h2>
                  <p className="text-muted-foreground">
                    Scopri i servizi extra per portare la gestione del tuo club al livello successivo
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {marketplaceItems.map((item) => (
                    <Card
                      key={item.id}
                      className="relative overflow-hidden hover:shadow-xl transition-all duration-300 group"
                    >
                      {item.popular && (
                        <div className="absolute top-4 right-4">
                          <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white">
                            <Star className="h-3 w-3 mr-1" />
                            Popolare
                          </Badge>
                        </div>
                      )}
                      <CardHeader>
                        <div className="flex items-start gap-4">
                          <div
                            className={`p-3 rounded-xl bg-gradient-to-r ${item.color} shadow-lg group-hover:scale-110 transition-transform`}
                          >
                            <item.icon className="h-6 w-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-xl">{item.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {item.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <ul className="space-y-2 mb-4">
                          {item.features.map((feature, idx) => (
                            <li key={idx} className="flex items-center gap-2 text-sm">
                              <CheckCircle className="h-4 w-4 text-green-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center justify-between">
                          <span className="text-2xl font-bold text-primary">
                            {item.price}
                          </span>
                          <Button className={`bg-gradient-to-r ${item.color} text-white hover:opacity-90`}>
                            Acquista
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* News Tab */}
              <TabsContent value="news" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold mb-2">Ultime Novità</h2>
                  <p className="text-muted-foreground">
                    Resta aggiornato sulle ultime funzionalità e miglioramenti
                  </p>
                </div>
                <div className="space-y-4">
                  {newsItems.map((news) => (
                    <Card
                      key={news.id}
                      className="hover:shadow-lg transition-all duration-300"
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                          <div
                            className={`p-3 rounded-full ${
                              news.type === "feature"
                                ? "bg-green-100 dark:bg-green-900"
                                : news.type === "update"
                                ? "bg-blue-100 dark:bg-blue-900"
                                : "bg-purple-100 dark:bg-purple-900"
                            }`}
                          >
                            {news.type === "feature" ? (
                              <Rocket className="h-5 w-5 text-green-600 dark:text-green-400" />
                            ) : news.type === "update" ? (
                              <Zap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h3 className="font-semibold text-lg">{news.title}</h3>
                              <Badge variant="outline">{news.date}</Badge>
                            </div>
                            <p className="text-muted-foreground">{news.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Tutorials & FAQ Tab */}
              <TabsContent value="tutorials" className="space-y-8">
                {/* Tutorials Section */}
                <div>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Video Tutorial</h2>
                    <p className="text-muted-foreground">
                      Impara a usare EasyGame con i nostri tutorial guidati
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {tutorialItems.map((tutorial) => (
                      <Card
                        key={tutorial.id}
                        className="overflow-hidden hover:shadow-lg transition-all duration-300 cursor-pointer group"
                      >
                        <div className="relative h-32 bg-gradient-to-br from-blue-500 to-purple-600">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="p-3 rounded-full bg-white/20 group-hover:bg-white/30 transition-colors">
                              <Play className="h-8 w-8 text-white" />
                            </div>
                          </div>
                          <Badge className="absolute top-2 right-2 bg-black/50 text-white">
                            {tutorial.duration}
                          </Badge>
                        </div>
                        <CardContent className="p-4">
                          <Badge variant="outline" className="mb-2">
                            {tutorial.category}
                          </Badge>
                          <h3 className="font-medium">{tutorial.title}</h3>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* FAQ Section */}
                <div>
                  <div className="text-center mb-6">
                    <h2 className="text-2xl font-bold mb-2">Domande Frequenti</h2>
                    <p className="text-muted-foreground">
                      Trova risposte alle domande più comuni
                    </p>
                  </div>
                  <div className="space-y-3 max-w-3xl mx-auto">
                    {faqItems.map((faq, idx) => (
                      <Card
                        key={idx}
                        className={`cursor-pointer transition-all duration-300 ${
                          expandedFaq === idx ? "ring-2 ring-blue-500" : ""
                        }`}
                        onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <HelpCircle className="h-5 w-5 text-blue-500" />
                              <span className="font-medium">{faq.question}</span>
                            </div>
                            <ChevronRight
                              className={`h-5 w-5 transition-transform ${
                                expandedFaq === idx ? "rotate-90" : ""
                              }`}
                            />
                          </div>
                          {expandedFaq === idx && (
                            <p className="mt-4 text-muted-foreground pl-8">
                              {faq.answer}
                            </p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Feedback Tab */}
              <TabsContent value="feedback" className="space-y-6">
                <div className="max-w-2xl mx-auto">
                  <Card className="overflow-hidden">
                    <div className="bg-gradient-to-r from-orange-500 to-red-500 p-6 text-white">
                      <div className="flex items-center gap-3">
                        <Heart className="h-8 w-8" />
                        <div>
                          <h2 className="text-2xl font-bold">Il tuo feedback conta!</h2>
                          <p className="text-white/90">
                            Aiutaci a migliorare EasyGame con i tuoi suggerimenti
                          </p>
                        </div>
                      </div>
                    </div>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-2">
                        <Label>Tipo di feedback</Label>
                        <div className="flex gap-2">
                          <Button
                            variant={feedbackType === "feedback" ? "default" : "outline"}
                            onClick={() => setFeedbackType("feedback")}
                            className={feedbackType === "feedback" ? "bg-blue-500" : ""}
                          >
                            💬 Feedback
                          </Button>
                          <Button
                            variant={feedbackType === "bug" ? "default" : "outline"}
                            onClick={() => setFeedbackType("bug")}
                            className={feedbackType === "bug" ? "bg-red-500" : ""}
                          >
                            🐛 Bug
                          </Button>
                          <Button
                            variant={feedbackType === "praise" ? "default" : "outline"}
                            onClick={() => setFeedbackType("praise")}
                            className={feedbackType === "praise" ? "bg-green-500" : ""}
                          >
                            ⭐ Complimento
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="feedback-text">Il tuo messaggio</Label>
                        <Textarea
                          id="feedback-text"
                          value={feedbackText}
                          onChange={(e) => setFeedbackText(e.target.value)}
                          placeholder="Scrivi qui il tuo feedback..."
                          rows={5}
                        />
                      </div>
                      <Button
                        className="w-full bg-gradient-to-r from-orange-500 to-red-500 text-white"
                        onClick={handleSendFeedback}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        Invia Feedback
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Proposals Tab */}
              <TabsContent value="proposals" className="space-y-6">
                <div className="max-w-2xl mx-auto">
                  <Card className="overflow-hidden">
                    <div className="bg-gradient-to-r from-yellow-500 to-orange-500 p-6 text-white">
                      <div className="flex items-center gap-3">
                        <Lightbulb className="h-8 w-8" />
                        <div>
                          <h2 className="text-2xl font-bold">Hai un'idea?</h2>
                          <p className="text-white/90">
                            Proponi nuove funzionalità per EasyGame
                          </p>
                        </div>
                      </div>
                    </div>
                    <CardContent className="p-6 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="proposal-title">Titolo della proposta</Label>
                        <Input
                          id="proposal-title"
                          value={proposalTitle}
                          onChange={(e) => setProposalTitle(e.target.value)}
                          placeholder="Es: Integrazione con WhatsApp"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="proposal-description">Descrizione dettagliata</Label>
                        <Textarea
                          id="proposal-description"
                          value={proposalDescription}
                          onChange={(e) => setProposalDescription(e.target.value)}
                          placeholder="Descrivi la tua idea in dettaglio..."
                          rows={5}
                        />
                      </div>
                      <Button
                        className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white"
                        onClick={handleSendProposal}
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Invia Proposta
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Contact Info */}
                  <Card className="mt-6">
                    <CardContent className="p-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900">
                          <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <h3 className="font-semibold">Contattaci direttamente</h3>
                          <p className="text-muted-foreground text-sm">
                            Per richieste urgenti o collaborazioni
                          </p>
                          <a
                            href="https://www.cedisoft.it/contatti/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline flex items-center gap-1 mt-1"
                          >
                            www.cedisoft.it/contatti
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  );
}

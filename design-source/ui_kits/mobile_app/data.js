window.EG_DATA = {
  coach: { name: "Andrea Ferrari", role: "Allenatore", club: "AS Roma Giovanili" },
  categories: [{ id: "u15", name: "Under 15" }, { id: "u17", name: "Under 17" }],
  athletes: [
    { id: "a1", name: "Marco Rossi", number: 9, category: "Under 15", position: "Attaccante", status: "attivo" },
    { id: "a2", name: "Luca Bianchi", number: 4, category: "Under 15", position: "Difensore", status: "attivo" },
    { id: "a3", name: "Davide Conti", number: 1, category: "Under 15", position: "Portiere", status: "infortunato" },
    { id: "a4", name: "Simone Greco", number: 7, category: "Under 15", position: "Centrocampista", status: "attivo" },
    { id: "a5", name: "Matteo Fabbri", number: 11, category: "Under 17", position: "Ala", status: "squalificato" },
    { id: "a6", name: "Nicolò Riva", number: 6, category: "Under 17", position: "Centrocampista", status: "attivo" },
    { id: "a7", name: "Filippo Sala", number: 3, category: "Under 17", position: "Difensore", status: "attivo" },
    { id: "a8", name: "Tommaso Neri", number: 10, category: "Under 17", position: "Trequartista", status: "attivo" }
  ],
  trainings: [
    { id: "t1", title: "Allenamento Portieri", date: "18 mar 2026", time: "18:00 - 19:30", location: "Palestra Comunale", category: "Under 15", present: 3, total: 4, status: "scheduled", when: "today" },
    { id: "t2", title: "Tecnica e Possesso", date: "18 mar 2026", time: "19:45 - 21:15", location: "Campo A", category: "Under 17", present: 0, total: 4, status: "scheduled", when: "today" },
    { id: "t3", title: "Atletica e Forza", date: "20 mar 2026", time: "18:30 - 20:00", location: "Palestra Comunale", category: "Under 15", present: 0, total: 4, status: "scheduled", when: "week" },
    { id: "t4", title: "Partitella Interna", date: "22 mar 2026", time: "10:00 - 11:30", location: "Campo A", category: "Under 17", present: 0, total: 4, status: "cancelled", when: "week" },
    { id: "t5", title: "Preparazione Tattica", date: "26 mar 2026", time: "18:00 - 19:30", location: "Campo B", category: "Under 15", present: 0, total: 4, status: "scheduled", when: "future" }
  ],
  matches: [
    { id: "m1", opponent: "Virtus Nord", date: "18 mar 2026", time: "15:30", location: "Campo Comunale · Casa", category: "Under 17", convoked: 11, when: "today" },
    { id: "m2", opponent: "Atletico Sud", date: "21 mar 2026", time: "11:00", location: "Centro Sportivo Sud · Trasferta", category: "Under 15", convoked: 0, when: "week" },
    { id: "m3", opponent: "Sporting Ovest", date: "23 mar 2026", time: "17:00", location: "Campo Comunale · Casa", category: "Under 17", convoked: 0, when: "week" }
  ],
  tasks: [
    { id: "k1", title: "Certificato medico in scadenza", due: "Scade 20 mar 2026" },
    { id: "k2", title: "Conferma distinta gara", due: "Scade 21 mar 2026" }
  ]
};

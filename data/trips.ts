import { Trip } from '../types';

const trips: Trip[] = [
  {
    id: 'mallorca-2026',
    name: 'Mallorca',
    subtitle: '22–29 giugno 2026 • focus primi 5 giorni (22–26)',
    coverImageUrl: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=800&q=80',
    startDate: '2026-06-22',
    endDate: '2026-06-29',
    location: 'Isole Baleari, Spagna',
    description:
      'Itinerario: Palma + coste e calette. I primi 5 giorni sono super dettagliati con tappe, mappe e trasporto pubblico; gli ultimi giorni restano più leggeri.',
    days: [
      {
        id: 'm-1',
        day: 1,
        date: '2026-06-22',
        title: 'Arrivo a Palma + centro storico',
        summary: 'Check-in, Cattedrale, Passeig del Born e tapas serali.',
        activities: [
          {
            id: 'm-1-a1',
            time: '10:00–12:00',
            title: 'Arrivo a PMI + bus per Palma (A1)',
            description: 'Atterra, ritira bagagli e prendi il bus diretto per il centro.',
            location: 'Aeroporto PMI → Palma Centro',
            photoUrl:
              'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca%20Airport',
            transport: {
              mode: 'bus',
              summary: 'A1 Aeroporto → Plaça d’Espanya (~25–35 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Palma%20de%20Mallorca%20Airport&destination=Pla%C3%A7a%20d%27Espanya%2C%20Palma&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 90,
          },
          {
            id: 'm-1-a2',
            time: '12:30–14:00',
            title: 'Check-in + pranzo leggero',
            description: 'Lascia i bagagli e fai un pranzo easy per ripartire.',
            location: 'Palma (hotel/appartamento)',
            photoUrl:
              'https://images.unsplash.com/photo-1565534003397-6ca8dc4d0cc7?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca%20old%20town',
            transport: {
              mode: 'walk',
              summary: 'A piedi dal centro / breve bus urbano',
            },
            tags: ['cibo', 'logistica'],
            durationMins: 90,
          },
          {
            id: 'm-1-a3',
            time: '15:00–17:00',
            title: 'Cattedrale di Palma (La Seu) + Parc de la Mar',
            description: 'Icona gotica sul mare e passeggiata rilassata nel parco.',
            location: 'Catedral-Basílica de Santa María de Mallorca',
            photoUrl:
              'https://images.unsplash.com/photo-1559181567-c3190bcea943?auto=format&fit=crop&w=1200&q=80',
            mapsUrl:
              'https://www.google.com/maps/search/?api=1&query=Catedral%20de%20Mallorca%20La%20Seu',
            transport: {
              mode: 'bus',
              summary: 'Bus urbano verso “Catedral” (10–20 min) oppure a piedi dal centro',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&destination=Catedral%20de%20Mallorca%20La%20Seu&travelmode=transit',
            },
            tags: ['cultura', 'foto'],
            durationMins: 120,
          },
          {
            id: 'm-1-a4',
            time: '17:30–19:00',
            title: 'Passeig del Born + Plaça Major',
            description: 'Vetrine, architettura e vibe cittadina “golden hour”.',
            location: 'Passeig des Born, Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1542816417-0983c9c9ad53?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Passeig%20des%20Born%20Palma',
            transport: {
              mode: 'walk',
              summary: 'A piedi dal centro storico',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&destination=Passeig%20des%20Born%2C%20Palma&travelmode=walking',
            },
            tags: ['passeggiata'],
            durationMins: 90,
          },
          {
            id: 'm-1-a5',
            time: '20:00–22:00',
            title: 'Tapas + drink nel centro',
            description: 'Cena informale: 2–3 tapas + pa amb oli. Prenota se weekend.',
            location: 'La Lonja / Santa Catalina',
            photoUrl:
              'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Santa%20Catalina%20Palma',
            transport: {
              mode: 'walk',
              summary: 'A piedi (10–20 min) dal centro',
            },
            tags: ['cibo'],
            durationMins: 120,
          },
        ],
      },
      {
        id: 'm-2',
        day: 2,
        date: '2026-06-23',
        title: 'Spiaggia urbana + Santa Catalina',
        summary: 'Mattina a Can Pere Antoni o Cala Major, pomeriggio mercati e rooftop.',
        activities: [
          {
            id: 'm-2-a1',
            time: '09:30–12:30',
            title: 'Can Pere Antoni (spiaggia vicino al centro)',
            description: 'Prima nuotata + relax. Perfetta se vuoi stare comodo.',
            location: 'Platja de Can Pere Antoni',
            photoUrl:
              'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
            mapsUrl:
              'https://www.google.com/maps/search/?api=1&query=Platja%20de%20Can%20Pere%20Antoni',
            transport: {
              mode: 'walk',
              summary: 'A piedi / bus urbano (10–20 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&destination=Platja%20de%20Can%20Pere%20Antoni&travelmode=walking',
            },
            tags: ['mare', 'relax'],
            durationMins: 180,
          },
          {
            id: 'm-2-a2',
            time: '13:00–14:30',
            title: 'Pranzo a Santa Catalina',
            description: 'Zona top per mangiare bene: cucina mediterranea e pesce.',
            location: 'Santa Catalina, Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Santa%20Catalina%20Market%20Palma',
            transport: {
              mode: 'bus',
              summary: 'Bus urbano verso Santa Catalina (10–20 min) oppure passeggiata',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&destination=Santa%20Catalina%2C%20Palma&travelmode=transit',
            },
            tags: ['cibo'],
            durationMins: 90,
          },
          {
            id: 'm-2-a3',
            time: '15:30–17:30',
            title: 'Mercat de Santa Catalina + coffee stop',
            description: 'Gira tra banchi e prodotti locali. Perfetto per souvenir gourmet.',
            location: 'Mercat de Santa Catalina',
            photoUrl:
              'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80',
            mapsUrl:
              'https://www.google.com/maps/search/?api=1&query=Mercat%20de%20Santa%20Catalina',
            transport: {
              mode: 'walk',
              summary: 'A piedi in quartiere',
            },
            tags: ['shopping'],
            durationMins: 120,
          },
          {
            id: 'm-2-a4',
            time: '19:00–21:00',
            title: 'Rooftop / cocktail con vista',
            description: 'Scegli un rooftop in centro per chiudere la giornata con stile.',
            location: 'Centro Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=rooftop%20bar%20Palma%20de%20Mallorca',
            transport: {
              mode: 'walk',
              summary: 'A piedi dal centro',
            },
            tags: ['relax'],
            durationMins: 120,
          },
        ],
      },
      {
        id: 'm-3',
        day: 3,
        date: '2026-06-24',
        title: 'Cala Pi o Es Trenc (giornata mare)',
        summary: 'Una “spiaggia wow” con sabbia chiara e acqua turchese.',
        activities: [
          {
            id: 'm-3-a1',
            time: '08:30–10:30',
            title: 'Bus verso la costa sud',
            description: 'Parti presto per evitare code e trovare posto comodo.',
            location: 'Palma → Campos / zona Es Trenc',
            photoUrl:
              'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Es%20Trenc%20Mallorca',
            transport: {
              mode: 'bus',
              summary: 'Bus interurbano TIB verso Campos + navetta/taxi breve',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Palma%2C%20Mallorca&destination=Es%20Trenc&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 120,
          },
          {
            id: 'm-3-a2',
            time: '10:30–16:30',
            title: 'Es Trenc (spiaggia + nuotate)',
            description: 'Lunga e scenografica. Porta acqua e protezione solare.',
            location: 'Platja d’Es Trenc',
            photoUrl:
              'https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Platja%20d%27Es%20Trenc',
            transport: {
              mode: 'walk',
              summary: 'Ultimo tratto a piedi (10–20 min) dai parcheggi/navette',
            },
            tags: ['mare', 'relax'],
            durationMins: 360,
          },
          {
            id: 'm-3-a3',
            time: '17:00–19:30',
            title: 'Rientro a Palma + doccia',
            description: 'Rientro con calma, magari con una sosta snack on the road.',
            location: 'Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca',
            transport: {
              mode: 'bus',
              summary: 'Ritorno TIB verso Palma (1–1h30)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Es%20Trenc&destination=Palma%2C%20Mallorca&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 150,
          },
          {
            id: 'm-3-a4',
            time: '20:30–22:00',
            title: 'Cena: paella o pesce',
            description: 'Dopo il mare: cena easy ma buona. Prenota se serve.',
            location: 'Palma (zona mare o centro)',
            photoUrl:
              'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=seafood%20restaurant%20Palma%20de%20Mallorca',
            transport: {
              mode: 'walk',
              summary: 'A piedi / bus urbano breve',
            },
            tags: ['cibo'],
            durationMins: 90,
          },
        ],
      },
      {
        id: 'm-4',
        day: 4,
        date: '2026-06-25',
        title: 'Valldemossa + Deià (Serra de Tramuntana)',
        summary: 'Borghi super fotogenici, strade panoramiche e vibe slow.',
        activities: [
          {
            id: 'm-4-a1',
            time: '09:00–10:00',
            title: 'Bus Palma → Valldemossa',
            description: 'Parti la mattina per vivere il borgo prima della folla.',
            location: 'Valldemossa',
            photoUrl:
              'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Valldemossa',
            transport: {
              mode: 'bus',
              summary: 'Bus TIB Palma → Valldemossa (~35–45 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Palma%2C%20Mallorca&destination=Valldemossa&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 60,
          },
          {
            id: 'm-4-a2',
            time: '10:00–12:00',
            title: 'Passeggiata nel borgo + “coca de patata”',
            description: 'Vicoli, balconi fioriti e pausa dolce in piazzetta.',
            location: 'Centro Valldemossa',
            photoUrl:
              'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Valldemossa%20old%20town',
            transport: {
              mode: 'walk',
              summary: 'A piedi (tutto concentrato)',
            },
            tags: ['passeggiata', 'cibo', 'foto'],
            durationMins: 120,
          },
          {
            id: 'm-4-a3',
            time: '12:30–13:15',
            title: 'Bus Valldemossa → Deià',
            description: 'Tratto breve e panoramico: finestrino a sinistra!',
            location: 'Deià',
            photoUrl:
              'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Deia%20Mallorca',
            transport: {
              mode: 'bus',
              summary: 'Bus TIB verso Deià (~15–25 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Valldemossa&destination=Dei%C3%A0&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 45,
          },
          {
            id: 'm-4-a4',
            time: '13:30–15:00',
            title: 'Pranzo con vista (Deià)',
            description: 'Scegli una terrazza panoramica. Prenota se necessario.',
            location: 'Deià',
            photoUrl:
              'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=restaurant%20Dei%C3%A0%20Mallorca',
            transport: {
              mode: 'walk',
              summary: 'A piedi nel paese',
            },
            tags: ['cibo'],
            durationMins: 90,
          },
          {
            id: 'm-4-a5',
            time: '15:30–17:30',
            title: 'Passeggiata panoramica + viewpoint',
            description: 'Cammina verso un belvedere per scatti incredibili.',
            location: 'Deià viewpoint',
            photoUrl:
              'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Deia%20mirador',
            transport: {
              mode: 'walk',
              summary: 'A piedi (saliscendi)',
            },
            tags: ['foto', 'natura'],
            durationMins: 120,
          },
          {
            id: 'm-4-a6',
            time: '18:00–19:30',
            title: 'Rientro a Palma',
            description: 'Torna con calma prima di cena.',
            location: 'Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca',
            transport: {
              mode: 'bus',
              summary: 'Bus TIB verso Palma (45–70 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Dei%C3%A0&destination=Palma%2C%20Mallorca&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 90,
          },
        ],
      },
      {
        id: 'm-5',
        day: 5,
        date: '2026-06-26',
        title: 'Sóller + Port de Sóller',
        summary: 'Treno storico (o bus), aranceti e mare al porto.',
        activities: [
          {
            id: 'm-5-a1',
            time: '09:00–10:30',
            title: 'Treno storico Palma → Sóller (opzione wow)',
            description: 'Un classico: treno vintage tra montagne e panorami.',
            location: 'Estació Intermodal (Plaça d’Espanya) → Sóller',
            photoUrl:
              'https://images.unsplash.com/photo-1474487548417-781cb6d646d1?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=S%C3%B3ller%20train%20station',
            transport: {
              mode: 'train',
              summary: 'Tren de Sóller (circa 1h)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Pla%C3%A7a%20d%27Espanya%2C%20Palma&destination=S%C3%B3ller&travelmode=transit',
            },
            tags: ['logistica', 'foto'],
            durationMins: 90,
          },
          {
            id: 'm-5-a2',
            time: '10:30–12:00',
            title: 'Sóller: piazza + caffè',
            description: 'Giro nel centro, pausa caffè e atmosfera tranquilla.',
            location: 'Sóller (Plaça Constitució)',
            photoUrl:
              'https://images.unsplash.com/photo-1526481280695-3c687fd5432c?auto=format&fit=crop&w=1600&q=80',
            mapsUrl:
              'https://www.google.com/maps/search/?api=1&query=Pla%C3%A7a%20Constituci%C3%B3%20S%C3%B3ller',
            transport: {
              mode: 'walk',
              summary: 'A piedi (centro compatto)',
            },
            tags: ['passeggiata'],
            durationMins: 90,
          },
          {
            id: 'm-5-a3',
            time: '12:15–12:45',
            title: 'Tram Sóller → Port de Sóller',
            description: 'Piccolo tram scenografico fino al porto.',
            location: 'Sóller → Port de Sóller',
            photoUrl:
              'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Port%20de%20S%C3%B3ller',
            transport: {
              mode: 'tram',
              summary: 'Tram storico (20–30 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=S%C3%B3ller&destination=Port%20de%20S%C3%B3ller&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 30,
          },
          {
            id: 'm-5-a4',
            time: '13:00–16:30',
            title: 'Port de Sóller: mare + pranzo',
            description: 'Spiaggia, passeggiata sul lungomare e pranzo vista barche.',
            location: 'Port de Sóller',
            photoUrl:
              'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Platja%20d%27en%20Repic',
            transport: {
              mode: 'walk',
              summary: 'A piedi tra spiaggia e lungomare',
            },
            tags: ['mare', 'cibo', 'relax'],
            durationMins: 210,
          },
          {
            id: 'm-5-a5',
            time: '17:00–19:00',
            title: 'Rientro a Palma',
            description: 'Tram + treno/bus. Arrivo serale in città.',
            location: 'Port de Sóller → Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca',
            transport: {
              mode: 'train',
              summary: 'Tram + treno/bus (1h30–2h)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Port%20de%20S%C3%B3ller&destination=Palma%2C%20Mallorca&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 120,
          },
        ],
      },
      {
        id: 'm-6',
        day: 6,
        date: '2026-06-27',
        title: 'Giornata libera (calette o shopping)',
        summary: 'Recupero energie: scegli una cala vicina o relax in città.',
        activities: [
          {
            id: 'm-6-a1',
            time: '10:00–13:00',
            title: 'Opzione: Cala Major / Illetes',
            description: 'Spiagge comode vicino Palma per una mattina slow.',
            location: 'Cala Major / Illetes',
            photoUrl:
              'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Illetes%20Mallorca',
            transport: {
              mode: 'bus',
              summary: 'Bus urbano verso la costa ovest (20–35 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Palma%2C%20Mallorca&destination=Illetes%2C%20Mallorca&travelmode=transit',
            },
            tags: ['mare', 'relax'],
            durationMins: 180,
          },
        ],
      },
      {
        id: 'm-7',
        day: 7,
        date: '2026-06-28',
        title: 'Palma easy + souvenir',
        summary: 'Ultimo giro: musei leggeri, shopping e cena finale.',
        activities: [
          {
            id: 'm-7-a1',
            time: '11:00–13:00',
            title: 'Passeggiata + souvenir',
            description: 'Ultimi acquisti e caffè in centro.',
            location: 'Centro Palma',
            photoUrl:
              'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1600&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Pla%C3%A7a%20Major%20Palma',
            transport: { mode: 'walk', summary: 'A piedi' },
            tags: ['shopping'],
            durationMins: 120,
          },
        ],
      },
      {
        id: 'm-8',
        day: 8,
        date: '2026-06-29',
        title: 'Partenza',
        summary: 'Check-out e bus A1 per l’aeroporto.',
        activities: [
          {
            id: 'm-8-a1',
            time: '08:30–10:00',
            title: 'Bus A1 verso aeroporto',
            description: 'Parti con margine per sicurezza e controlli.',
            location: 'Palma → Aeroporto PMI',
            photoUrl:
              'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=1200&q=80',
            mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Palma%20de%20Mallorca%20Airport',
            transport: {
              mode: 'bus',
              summary: 'A1 Centro → Aeroporto (25–35 min)',
              routeUrl:
                'https://www.google.com/maps/dir/?api=1&origin=Pla%C3%A7a%20d%27Espanya%2C%20Palma&destination=Palma%20de%20Mallorca%20Airport&travelmode=transit',
            },
            tags: ['logistica'],
            durationMins: 90,
          },
        ],
      },
    ],
  },
];

export default trips;

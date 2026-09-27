/*
  modifiche.js – avvisa delle modifiche dell'ultimo minuto all'orario della giornata.

  Ogni volta che l'app scarica l'orario pubblicato, lo confronta con l'ultima versione vista
  su questo dispositivo. Se sono cambiate lezioni del giorno mostrato (oggi, o il prossimo giorno
  di scuola se le lezioni di oggi sono finite), le ricorda per tutta la giornata:
  per ogni ora e classe si vede com'era PRIMA e com'è ADESSO (materia, docente, aula).

  Si controlla solo l'orario pubblicato (dati/orario.json): le prove in corso nella bozza
  di Orario Facile non fanno scattare avvisi.
  Tutto resta su questo dispositivo (localStorage, chiavi "orariodada.fotoOrario" e "orariodada.modifiche").
*/
const Modifiche = (() => {
  const CHIAVE_FOTO = 'orariodada.fotoOrario';   // l'ultima versione dell'orario vista qui
  const CHIAVE_ELENCO = 'orariodada.modifiche';  // le modifiche della giornata trovate finora

  const leggi = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const scrivi = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* memoria piena o bloccata */ } };

  // Data di oggi, es. "2026-09-25"
  function oggi() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Una lezione in forma compatta (occupa poco spazio in memoria)
  const compatta = l => ({ g: l.giorno, o: l.ora, c: l.classe, m: l.materia, d: l.docente, a: l.aula });
  // La "casella" dell'orario: giorno + ora + classe
  const casella = x => x.g + '|' + x.o + '|' + x.c;
  // Il contenuto di una casella in una stringa, per confrontarlo facilmente
  const firma = elenco => (elenco || []).map(x => [x.m, x.d, x.a].join('~')).sort().join('#');

  // Le caselle del giorno indicato che sono diverse tra le due versioni
  function confronta(prima, dopo, giorno) {
    const raggruppa = elenco => {
      const mappa = new Map();
      elenco.filter(x => x.g === giorno).forEach(x => {
        const k = casella(x);
        if (!mappa.has(k)) mappa.set(k, []);
        mappa.get(k).push(x);
      });
      return mappa;
    };
    const P = raggruppa(prima), N = raggruppa(dopo);
    const diverse = [];
    new Set([...P.keys(), ...N.keys()]).forEach(k => {
      if (firma(P.get(k)) === firma(N.get(k))) return;
      const [g, o, c] = k.split('|');
      diverse.push({ chiave: k, giorno: g, ora: Number(o), classe: c, prima: P.get(k) || [], dopo: N.get(k) || [] });
    });
    return diverse;
  }

  /*
    Da chiamare ogni volta che l'orario viene caricato.
    Restituisce { giorno, elenco, nuove, daVedere }:
    - elenco: tutte le modifiche della giornata per quel giorno
    - nuove: quante ne sono arrivate con questo caricamento
    - daVedere: true se ci sono modifiche che l'utente non ha ancora visto
    Ogni modifica ha anche "vista" (true se la sua storia è già stata guardata) e "id"
    (cambia se la stessa casella cambia di nuovo, così torna "da vedere").
  */
  function controlla(D, giorno) {
    let salvate = leggi(CHIAVE_ELENCO);
    if (!salvate || salvate.data !== oggi() || salvate.giorno !== giorno) {
      salvate = { data: oggi(), giorno, elenco: [], viste: [] };
    }
    if (!Array.isArray(salvate.viste)) salvate.viste = [];
    let nuove = 0;
    if (D.fonte === 'pubblicato') {
      // solo le lezioni curricolari: spuntare o togliere «Compresenze» non è una modifica dell'orario
      const adesso = (D.lezioniCurricolari || D.lezioni).map(compatta);
      const foto = leggi(CHIAVE_FOTO);
      // La prima volta su questo dispositivo non c'è niente con cui confrontare: si salva e basta
      if (foto && Array.isArray(foto.lezioni) && giorno) {
        confronta(foto.lezioni, adesso, giorno).forEach(n => {
          nuove++;
          // Stessa casella cambiata più volte: tengo il "prima" più vecchio e il "dopo" più recente
          const vecchia = salvate.elenco.find(x => x.chiave === n.chiave);
          if (vecchia) vecchia.dopo = n.dopo; else salvate.elenco.push(n);
        });
        // Se una casella è tornata com'era, non è più una modifica
        salvate.elenco = salvate.elenco.filter(x => firma(x.prima) !== firma(x.dopo));
        salvate.elenco.sort((a, b) => a.ora - b.ora || a.classe.localeCompare(b.classe, 'it', { numeric: true }));
      }
      scrivi(CHIAVE_FOTO, { lezioni: adesso });
      scrivi(CHIAVE_ELENCO, salvate);
    }
    const elenco = salvate.elenco.map(x => {
      const id = idModifica(x);
      return Object.assign({}, x, { id, vista: salvate.viste.includes(id) });
    });
    return { giorno, elenco, nuove, daVedere: elenco.some(x => !x.vista) };
  }

  // Identifica una modifica: casella + come è diventata
  const idModifica = x => x.chiave + '=' + firma(x.dopo);

  /* ---------- Modalità prova (indirizzo .../app/?provastorie) ----------
     Crea tre modifiche FINTE sulle lezioni del giorno, per provare i cerchi e le storie senza
     cambiare l'orario vero. Restano solo in memoria su questo dispositivo: riaprendo l'app
     senza ?provastorie spariscono. Il "dopo" è la lezione vera, il "prima" è inventato. */
  let inProva = false;
  const visteProva = new Set();

  function prova(D, giorno) {
    inProva = true;
    const lezioni = D.lezioni.filter(l => l.giorno === giorno).map(compatta)
      .sort((a, b) => a.o - b.o || String(a.c).localeCompare(String(b.c), 'it', { numeric: true }));
    const altra = (campo, diversa) => (lezioni.find(l => l[campo] && l[campo] !== diversa) || {})[campo] || '';
    const scelte = [lezioni[0], lezioni[Math.floor(lezioni.length / 2)], lezioni[lezioni.length - 1]].filter(Boolean);
    const elenco = scelte.map((l, k) => {
      let prima;
      if (k === 0) prima = [Object.assign({}, l, { a: altra('a', l.a) })];                        // cambio d'aula
      else if (k === 1) prima = [Object.assign({}, l, { m: altra('m', l.m), d: altra('d', l.d) })]; // cambio di materia e docente
      else prima = [];                                                                            // lezione aggiunta
      const x = { chiave: casella(l), giorno, ora: l.o, classe: l.c, prima, dopo: [l], prova: true };
      x.id = idModifica(x);
      x.vista = visteProva.has('*') || visteProva.has(x.id);   // '*' = "Segna tutte come viste"
      return x;
    });
    return { giorno, elenco, nuove: 0, daVedere: elenco.some(x => !x.vista), prova: true };
  }

  // Una storia è stata guardata (id) oppure, senza id, "Segna tutte come viste"
  function segnaVista(id) {
    if (inProva) { if (id) visteProva.add(id); else visteProva.add('*'); return; }
    const salvate = leggi(CHIAVE_ELENCO);
    if (!salvate) return;
    if (!Array.isArray(salvate.viste)) salvate.viste = [];
    const nuove = id ? [id] : salvate.elenco.map(idModifica);
    nuove.forEach(v => { if (!salvate.viste.includes(v)) salvate.viste.push(v); });
    scrivi(CHIAVE_ELENCO, salvate);
  }

  // Le caselle modificate, per evidenziarle nella tabella ("giorno|ora|classe")
  const caselle = risultato => new Set((risultato ? risultato.elenco : []).map(x => x.chiave));

  return { controlla, segnaVista, caselle, prova };
})();

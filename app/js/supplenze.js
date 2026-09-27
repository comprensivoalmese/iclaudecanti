/*
  supplenze.js – mostra nella tabella dell'orario le assenze e le sostituzioni della settimana.

  Le assenze e le sostituzioni si registrano nella scheda Sostituzioni di Orario Facile o nella pagina
  «Sostituzioni smart» e restano nella memoria di questo dispositivo (chiavi "sostituzioni.assenze" e
  "sostituzioni.registro", vedi sostituzioni/js/archivio.js). Qui le rileggiamo e prepariamo:
  - segnate: le lezioni dei docenti assenti, con il nome di chi le sostituisce (o "da coprire");
  - extra:   le stesse lezioni "copiate" al docente che sostituisce, così compaiono anche nel suo orario.
  La settimana considerata è quella in corso (di sabato e domenica si guarda già la prossima).

  Sostituzioni pubblicate: con il tasto «Pubblica sostituzioni» di Orario Facile le assenze e le sostituzioni
  vanno in un file su Google Drive (CONFIG.fileSostituzioniPubblicate), che scarica() legge per tutti i dispositivi.
  Si mostrano quelle pubblicate UNITE a quelle registrate su questo dispositivo (vincono quelle di qui).
  Allo stesso modo i cambi d'aula (chiave "sostituzioni.cambiAula", sostituzioni/js/cambi-aula.js): cambi = Map
  "giorno|ora|classe" -> { da, a }, letti con cambioAula().
*/
const Supplenze = (() => {
  const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const CHIAVE_COPIA = 'orariodada.copiaSostituzioni';   // ultima copia delle sostituzioni pubblicate (senza rete)

  const leggi = k => { try { return JSON.parse(localStorage.getItem(k) || '[]') || []; } catch (e) { return []; } };

  // Le sostituzioni pubblicate su Drive: { assenze: [], registro: [] } oppure null (non configurate o mai scaricate)
  let pubblicate = null;
  const elenchi = o => ({ assenze: Array.isArray(o && o.assenze) ? o.assenze : [], registro: Array.isArray(o && o.registro) ? o.registro : [],
    cambi: Array.isArray(o && o.cambi) ? o.cambi : [], annullate: Array.isArray(o && o.annullate) ? o.annullate : [],
    uscite: Array.isArray(o && o.uscite) ? o.uscite : [], assenzeAnnullate: Array.isArray(o && o.assenzeAnnullate) ? o.assenzeAnnullate : [] });
  // Come si riconosce la stessa voce anche senza ID (pubblicata con una versione vecchia)
  const SEGNO = { assenze: a => a.data + '|' + a.docente, registro: s => s.data + '|' + s.ora + '|' + s.classe, cambi: c => c.data + '|' + c.ora + '|' + c.classe,
    uscite: u => u.data + '|' + (u.classi || []).join(',') };
  /*
    Unisce le voci pubblicate (di tutti i dispositivi) con quelle di questo dispositivo: vincono quelle di qui, e
    spariscono quelle che questo dispositivo aveva pubblicato e poi annullato (ID in "sostituzioni.pubblicateDaQui").
    Spariscono anche le sostituzioni annullate da un altro dispositivo (elenco "annullate" del file pubblicato) o da qui
    con il tasto «✕ Annulla» della tabella (chiave "sostituzioni.annullate"), vedi app/js/pubblica-sostituzioni.js.
    Allo stesso modo spariscono le assenze tolte da un altro dispositivo o da qui ("assenzeAnnullate").
  */
  function unisci(pub, loc) {
    const daQui = new Set(leggi('sostituzioni.pubblicateDaQui'));
    const out = {};
    Object.keys(SEGNO).forEach(k => {
      const L = loc[k], id = new Set(L.map(x => x.id)), segni = new Set(L.map(SEGNO[k]));
      out[k] = (pub ? pub[k] : []).filter(x => !(x.id && (id.has(x.id) || daQui.has(x.id))) && !segni.has(SEGNO[k](x))).concat(L);
    });
    const annullate = (pub ? pub.annullate : []).concat(loc.annullate || []);
    if (annullate.length && typeof PubblicaSostituzioni !== 'undefined') {
      const colpisce = PubblicaSostituzioni.colpita(annullate);
      out.registro = out.registro.filter(s => !colpisce(s));
    }
    const assenzeAnnullate = (pub ? pub.assenzeAnnullate : []).concat(loc.assenzeAnnullate || []);
    if (assenzeAnnullate.length && typeof PubblicaSostituzioni !== 'undefined') {
      const colpisce = PubblicaSostituzioni.assenzaColpita(assenzeAnnullate);
      out.assenze = out.assenze.filter(a => !colpisce(a));
      // anche le sostituzioni di quelle assenze (chi l'ha tolta le ha già annullate, ma può non averle viste tutte),
      // purché quel giorno il docente non sia ancora assente per un'assenza nuova
      const tolta = new Set(assenzeAnnullate.map(a => a.data + '|' + a.docente));
      const resta = new Set(out.assenze.map(a => a.data + '|' + a.docente));
      out.registro = out.registro.filter(s => !tolta.has(s.data + '|' + s.assente) || resta.has(s.data + '|' + s.assente));
    }
    return out;
  }

  // Scarica le sostituzioni pubblicate; restituisce true se sono cambiate (non lancia mai errori)
  async function scarica() {
    // con la chiave API o con il permesso Google di chi ha fatto l'accesso (vedi Dati.leggiDrive)
    if (typeof Dati === 'undefined' || !Dati.driveLeggibile(CONFIG.fileSostituzioniPubblicate)) return false;
    const prima = JSON.stringify(pubblicate);
    try {
      const testo = await Dati.leggiDrive(CONFIG.fileSostituzioniPubblicate);
      pubblicate = elenchi(JSON.parse(testo));
      try { localStorage.setItem(CHIAVE_COPIA, testo); } catch (e) { /* spazio pieno o bloccato: pazienza */ }
      // sostituzioni di questo dispositivo annullate da qualcun altro: spariscono anche dal registro di qui
      // (e così le assenze di qui tolte da qualcun altro)
      if (typeof PubblicaSostituzioni !== 'undefined') PubblicaSostituzioni.applicaAnnullate(pubblicate.annullate, pubblicate.assenzeAnnullate);
    } catch (e) {
      // senza rete: l'ultima copia salvata su questo dispositivo
      if (!pubblicate) { try { const c = localStorage.getItem(CHIAVE_COPIA); if (c) pubblicate = elenchi(JSON.parse(c)); } catch (x) { /* ignorato */ } }
    }
    return JSON.stringify(pubblicate) !== prima;
  }
  // "Lunedì" -> "lunedi": per confrontare i nomi dei giorni senza badare ad accenti e maiuscole
  const semplice = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Il lunedì della settimana da mostrare: questa settimana, oppure la prossima se oggi è sabato o domenica
  function lunedi() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    else d.setDate(d.getDate() - (d.getDay() - 1));
    return d;
  }

  // Le date dei giorni di scuola della settimana: Map "Lunedì" -> "2026-09-28"
  function dateSettimana(D) {
    const date = new Map();
    const d = lunedi();
    for (let i = 0; i < 7; i++) {
      const giorno = D.giorni.find(g => semplice(g) === semplice(NOMI_GIORNI[d.getDay()]));
      if (giorno) date.set(giorno, isoLocale(d));
      d.setDate(d.getDate() + 1);
    }
    return date;
  }

  // La "casella" di una lezione: giorno, ora, classe e docente
  const chiave = (giorno, ora, classe, docente) => [giorno, ora, classe, docente].join('|');

  /*
    Assenze e sostituzioni della settimana per l'orario D.
    Restituisce { segnate: Map chiave -> { assente, sostituto, voce }, extra: [lezioni del sostituto], date }.
  */
  function settimana(D) {
    const date = dateSettimana(D);
    const giornoDi = new Map([...date].map(([g, iso]) => [iso, g]));   // "2026-09-28" -> "Lunedì"
    const segnate = new Map();
    const extra = [];

    // Le voci pubblicate (di tutti) unite a quelle registrate su questo dispositivo
    const locali = { assenze: leggi('sostituzioni.assenze'), registro: leggi('sostituzioni.registro'), cambi: leggi('sostituzioni.cambiAula'),
      annullate: leggi('sostituzioni.annullate'), uscite: leggi('sostituzioni.uscite').filter(u => u.confermata !== false), assenzeAnnullate: leggi('sostituzioni.assenzeAnnullate') };
    const fonte = unisci(pubblicate, locali);

    // 0. le uscite didattiche (sostituzioni/js/uscite.js): "giorno|ora|classe" delle classi fuori
    const fuori = new Set();
    fonte.uscite.forEach(u => {
      const giorno = giornoDi.get(u.data);
      if (giorno && Array.isArray(u.classi) && Array.isArray(u.ore)) u.classi.forEach(c => u.ore.forEach(h => fuori.add([giorno, h, c].join('|'))));
    });
    const eFuori = l => fuori.has([l.giorno, l.ora, l.classe].join('|'));
    D.lezioni.filter(eFuori).forEach(l => segnate.set(chiave(l.giorno, l.ora, l.classe, l.docente), { uscita: true, assente: '', sostituto: '' }));

    // 1. le lezioni dei docenti assenti (per ora senza sostituto: "da coprire"); non quelle delle classi fuori
    //    assenza = l'assenza così com'è registrata: serve al tasto «✕ Togli assenza» della tabella
    fonte.assenze.forEach(a => {
      const giorno = giornoDi.get(a.data);
      if (!giorno || !Array.isArray(a.ore)) return;
      const assenza = { id: a.id || '', data: a.data, docente: a.docente, ore: a.ore };
      D.lezioni.filter(l => l.giorno === giorno && l.docente === a.docente && a.ore.includes(l.ora) && !eFuori(l))
        .forEach(l => segnate.set(chiave(giorno, l.ora, l.classe, l.docente), { assente: l.docente, sostituto: '', assenza }));
    });

    // 2. le sostituzioni assegnate: chi sostituisce, e la lezione in più nel suo orario
    fonte.registro.forEach(s => {
      const giorno = giornoDi.get(s.data);
      if (!giorno || !D.mappa.docente.has(s.sostituto)) return;
      const l = D.lezioni.find(x => x.giorno === giorno && x.ora === s.ora && x.classe === s.classe && x.docente === s.assente);
      if (!l) return;   // l'orario è cambiato e quella lezione non c'è più
      // voce = la sostituzione così com'è registrata: serve al tasto «✕ Annulla» della tabella
      segnate.set(chiave(giorno, l.ora, l.classe, l.docente), { assente: s.assente, sostituto: s.sostituto, voce: s });
      extra.push(Object.assign({}, l, { docente: s.sostituto, sostituzione: true, assente: s.assente, voce: s }));
    });

    // 3. i cambi d'aula: Map "giorno|ora|classe" -> { da, a } (aule, per ID)
    const cambi = new Map();
    fonte.cambi.forEach(c => {
      const giorno = giornoDi.get(c.data);
      if (giorno && c.a) cambi.set([giorno, c.ora, c.classe].join('|'), { da: c.da || '', a: c.a });
    });

    return { segnate, extra, date, cambi };
  }

  // Il cambio d'aula di una lezione della tabella ({ da, a }) oppure null
  function cambioAula(sost, l) {
    return (sost && sost.cambi && sost.cambi.get([l.giorno, l.ora, l.classe].join('|'))) || null;
  }

  // Le informazioni di una lezione della tabella (o null se è una lezione normale)
  function di(sost, l) {
    if (!sost) return null;
    if (l.sostituzione) return { assente: l.assente, sostituto: l.docente, copia: true, voce: l.voce };
    return sost.segnate.get(chiave(l.giorno, l.ora, l.classe, l.docente)) || null;
  }

  return { settimana, di, cambioAula, scarica, CHIAVI: ['sostituzioni.assenze', 'sostituzioni.registro', 'sostituzioni.cambiAula', 'sostituzioni.annullate', 'sostituzioni.uscite', 'sostituzioni.assenzeAnnullate'] };
})();

/*
  sostituzioni.js – la scheda "Sostituzioni" di Orario Facile.
  1. usa l'orario di Orario Facile e il foglio del conteggio ore caricato dal computer;
  2. si registrano i docenti assenti di un giorno;
  3. per ogni ora scoperta propone i docenti liberi, prima quelli con più ore a debito;
  4. tiene il conto delle ore fatte, da riportare poi nel foglio.

  Orario Facile la usa così:  Sostituzioni.monta(contenitore, () => orario)
  dove orario è nel formato di Dati.normalizza() (app/js/dati.js).
  Si può richiamare ogni volta che si apre la scheda: la prima volta disegna la scheda,
  le volte dopo rilegge l'orario (che nel frattempo può essere cambiato).
*/
const Sostituzioni = (() => {
  // Lunedì della settimana 1, se il foglio non lo scrive (settimana 1: dal 9 all'11 settembre 2026)
  const INIZIO_PREDEFINITO = '2026-09-07';
  // Quanti docenti proporre per ogni ora prima di "Mostra tutti"
  const PROPOSTE_VISIBILI = 4;
  // Versione della scheda, mostrata in cima: serve a capire se la pagina aperta è quella aggiornata
  // (va cambiata a ogni modifica importante del modo in cui la scheda scrive nei fogli)
  const VERSIONE = '28/09/2026 · 11 (sciopero / assemblea sindacale: entrate posticipate, uscite anticipate, vigilanze)';
  const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  // Dove si trovano i facsimili del foglio, rispetto alla pagina di Orario Facile
  const CARTELLA_ESEMPI = '../sostituzioni/esempio/';

  // Tutti gli id della scheda iniziano con "sost-" per non confondersi con quelli di Orario Facile
  const $ = id => document.getElementById('sost-' + id);

  // ---------- Stato della scheda ----------
  let contenitore = null;                         // dove è disegnata la scheda
  // Un'altra pagina che usa questo motore con un suo disegno (es. «Sostituzioni smart» nell'app Luis@i):
  // { avvisa(testo), ridisegna() }. Vedi collega() in fondo al file.
  let ui = null;
  let leggiOrario = null;                         // funzione che restituisce l'orario aggiornato
  let D = null;                                   // l'orario (formato di Dati.normalizza)
  let foglio = Archivio.leggi('foglio', null);     // il foglio del conteggio ore
  let assenze = Archivio.leggi('assenze', []);     // [{ id, data, docente, ore: [1, 2…] }]
  let registro = Archivio.leggi('registro', []);   // le sostituzioni assegnate
  let manuali = Archivio.leggi('abbinamenti', {}); // abbinamenti scelti a mano
  let abbinati = new Map();                       // idDocente -> { chiave, come }
  let righePerChiave = new Map();                 // chiave -> riga del foglio
  let dataScelta = '';                            // il giorno mostrato (lo sceglie l'avvio, in fondo)
  const aperte = new Set();                       // ore per cui si vedono tutti i docenti

  // ---------- Piccoli aiuti ----------

  // Crea un elemento HTML: el('p', { class: 'hint' }, 'testo', altroElemento)
  // (i testi sono inseriti come testo semplice, mai come HTML: più sicuro)
  function el(tag, attributi, ...figli) {
    const e = document.createElement(tag);
    Object.entries(attributi || {}).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    figli.flat().forEach(f => {
      if (f !== null && f !== undefined && f !== false) e.append(f instanceof Node ? f : String(f));
    });
    return e;
  }

  // Nome di una classe, di un'aula o di un docente a partire dal suo id
  const nome = (tipo, id) => { const e = D && D.mappa[tipo].get(id); return e ? e.nome : id; };

  // Mostra un messaggio breve in basso per qualche secondo
  let timerAvviso = null;
  function avvisa(testo) {
    if (ui) { ui.avvisa(testo); return; }   // un'altra pagina mostra i messaggi a modo suo
    const a = $('avviso');
    if (!a) return;
    a.textContent = testo;
    a.classList.add('visibile');
    clearTimeout(timerAvviso);
    // resta almeno 5 secondi, di più se il messaggio è lungo (circa 1 secondo ogni 15 lettere)
    timerAvviso = setTimeout(() => a.classList.remove('visibile'), Math.max(5000, testo.length * 65));
  }

  // Salva nella memoria del browser e avvisa se non ci riesce
  function salva(cosa, valore) {
    if (!Archivio.scrivi(cosa, valore)) {
      avvisa('Attenzione: non riesco a salvare su questo dispositivo (memoria piena o bloccata). I dati andranno persi chiudendo la pagina.');
    }
  }

  const nuovoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // "ROSSI" -> "Rossi", "D'AMICO" -> "D'Amico"
  const maiuscoleIniziali = s => String(s).toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

  // Numero con segno: -3 -> "−3", 2 -> "+2"
  const conSegno = n => n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  const ore = n => n === 1 ? '1 ora' : n + ' ore';

  // ---------- Date ----------
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daIso = iso => { const [a, m, g] = iso.split('-').map(Number); return new Date(a, m - 1, g); };
  function spostaGiorni(iso, n) { const d = daIso(iso); d.setDate(d.getDate() + n); return isoLocale(d); }
  // Oggi, oppure lunedì se oggi è sabato o domenica
  function giornoPredefinito() {
    const d = new Date();
    while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
    return isoLocale(d);
  }
  const dataLunga = iso => daIso(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dataBreve = iso => daIso(iso).toLocaleDateString('it-IT');
  const dataCorta = iso => daIso(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'numeric' });

  // Il nome del giorno come è scritto nell'orario ("Lunedì"), oppure null se quel giorno non c'è lezione
  function giornoOrario(iso) {
    const nome = Foglio.semplifica(NOMI_GIORNI[daIso(iso).getDay()]);
    return D.giorni.find(g => Foglio.semplifica(g) === nome) || null;
  }

  // I giorni di scuola della settimana di una data, da lunedì a domenica: [{ iso, giorno }]
  function giorniSettimana(iso) {
    const lunedi = spostaGiorni(iso, -((daIso(iso).getDay() + 6) % 7));
    const elenco = [];
    for (let i = 0; i < 7; i++) {
      const x = spostaGiorni(lunedi, i);
      const giorno = giornoOrario(x);
      if (giorno) elenco.push({ iso: x, giorno });
    }
    return elenco;
  }

  // Gli ALTRI giorni della stessa settimana in cui il docente ha lezione: [{ iso, giorno, ore: [1, 2…] }]
  function altriGiorniDi(iso, idDocente) {
    return giorniSettimana(iso).filter(g => g.iso !== iso)
      .map(g => Object.assign(g, { ore: [...new Set(lezioniDi(idDocente, g.giorno).map(l => l.ora))] }))
      .filter(g => g.ore.length);
  }

  // Numero della settimana di scuola (la colonna del foglio) per una data
  function settimanaDi(iso) {
    const [a, m, g] = ((foglio && foglio.inizio) || INIZIO_PREDEFINITO).split('-').map(Number);
    const [a2, m2, g2] = iso.split('-').map(Number);
    return Math.floor((Date.UTC(a2, m2 - 1, g2) - Date.UTC(a, m - 1, g)) / (7 * 86400000)) + 1;
  }

  // "3ª ora (10:00–11:00)"
  function testoOra(n) {
    const o = D.ore.find(x => x.n === n);
    return `${n}ª ora` + (o && o.inizio ? ` (${o.inizio}–${o.fine})` : '');
  }

  // ---------- Docenti, abbinamenti e saldi ----------
  function aggiornaAbbinamenti() {
    const righe = foglio ? foglio.docenti : [];
    righePerChiave = new Map(righe.map(r => [r.chiave, r]));
    abbinati = D ? Abbinamenti.calcola(D.docente, righe, manuali) : new Map();
  }

  // La riga del foglio di un docente dell'orario (o null)
  function rigaDi(idDocente) {
    const a = abbinati.get(idDocente);
    return a && a.chiave ? righePerChiave.get(a.chiave) || null : null;
  }

  const nomeRiga = r => (maiuscoleIniziali(r.cognome) + ' ' + r.nome).trim();
  // Nome da mostrare: quello completo del foglio se c'è, altrimenti quello dell'orario
  function nomeDocente(id) {
    const r = rigaDi(id);
    return r ? nomeRiga(r) : nome('docente', id);
  }

  // Come compare il docente nell'orario: il codice (DOC07) anche quando Orario Facile passa il nome vero
  // (con «👁 Nomi» attivo il nome è in t.nome e il codice in t.codice), oppure le iniziali ("F. A.")
  const sigla = t => t.codice || t.nome;
  // Vero se accanto al nome completo conviene mostrare anche il codice o le iniziali dell'orario
  const conSigla = t => !!rigaDi(t.id) && /\.|^DOC\d+$/i.test(sigla(t));

  // Sostituzioni fatte da una riga del foglio e non ancora riportate nel foglio
  // (quelle dei docenti «liberati» da un'uscita didattica non contano: era già una loro ora di lezione)
  function daRiportarePer(chiave) {
    return registro.filter(x => !x.riportata && !x.reindirizzato && x.sostituto && (rigaDi(x.sostituto) || {}).chiave === chiave).length;
  }

  // Saldo di un docente dell'orario: { foglio, extra, attuale } oppure null se non è nel foglio
  function saldoDi(idDocente) {
    const r = rigaDi(idDocente);
    if (!r) return null;
    const extra = daRiportarePer(r.chiave);
    return { foglio: r.totale, extra, attuale: r.totale + extra };
  }

  function etichettaSaldo(saldo) {
    if (!saldo) return el('span', { class: 'tag' }, 'non nel foglio');
    const n = saldo.attuale;
    const tipo = n < 0 ? 'bad' : n > 0 ? 'ok' : '';   // rosso = debito, verde = credito
    const testo = n < 0 ? `${ore(-n)} a debito` : n > 0 ? `${ore(n)} a credito` : 'in pari';
    return el('span', { class: 'tag ' + tipo }, `${conSegno(n)} · ${testo}`);
  }

  // ---------- Assenze e ore da coprire ----------
  const assenzeDel = iso => assenze.filter(a => a.data === iso);

  function lezioniDi(idDocente, giorno) {
    return D.lezioni.filter(l => l.giorno === giorno && l.docente === idDocente).sort((a, b) => a.ora - b.ora);
  }

  // Uscite didattiche (js/uscite.js): la classe è fuori a quell'ora? E il docente è "liberato" (le sue classi sono fuori)?
  const conUscite = () => typeof Uscite !== 'undefined';
  const classeFuori = (iso, classe, ora) => conUscite() && Uscite.classeFuori(iso, classe, ora);
  const liberato = (iso, idDocente, ora) => conUscite() && Uscite.liberato(iso, idDocente, ora);

  // Le lezioni dei docenti assenti in quel giorno, ciascuna con il campo "assente"
  // (non quelle delle classi in uscita didattica: la classe non c'è, non serve nessuno)
  function oreDaCoprire(iso) {
    const giorno = giornoOrario(iso);
    if (!giorno) return [];
    const elenco = [];
    assenzeDel(iso).forEach(a => {
      lezioniDi(a.docente, giorno).filter(l => a.ore.includes(l.ora) && !classeFuori(iso, l.classe, l.ora))
        .forEach(l => elenco.push(Object.assign({ assente: a.docente }, l)));
    });
    return elenco.sort((x, y) => x.ora - y.ora || x.classe.localeCompare(y.classe, 'it', { numeric: true }));
  }

  const sostituzioneDi = (iso, l) => registro.find(x =>
    x.data === iso && x.ora === l.ora && x.classe === l.classe && x.assente === l.assente);

  // Chi è assente a una certa ora di quel giorno
  const assentiAllOra = (iso, ora) => new Set(assenzeDel(iso).filter(a => a.ore.includes(ora)).map(a => a.docente));

  /*
    I docenti che possono coprire una lezione, già in ordine di preferenza:
    1. prima chi è a scuola quel giorno (ha almeno una lezione);
    2. poi chi ha più ore a debito (saldo più basso);
    3. poi chi ha un'ora buca, poi chi ha lezione subito prima o dopo;
    4. poi chi conosce già la classe.
    Con un'uscita didattica vengono prima di tutti i docenti «liberati» (la loro classe è fuori): sono già a scuola
    e l'ora fa parte del loro orario, quindi coprono senza ore in più (vedi js/uscite.js).
  */
  function candidati(iso, l) {
    const giorno = l.giorno;
    const assenti = assentiAllOra(iso, l.ora);
    // occupato = ha lezione in quell'ora con una classe che c'è (non in uscita)
    const occupati = new Set(D.lezioni.filter(k => k.giorno === giorno && k.ora === l.ora && !classeFuori(iso, k.classe, k.ora)).map(k => k.docente));
    const giaImpegnati = new Set(registro.filter(x => x.data === iso && x.ora === l.ora).map(x => x.sostituto));

    return D.docente
      .filter(t => !assenti.has(t.id) && !occupati.has(t.id) && !giaImpegnati.has(t.id) && !(conUscite() && Uscite.accompagna(iso, t.id, l.ora)))
      .map(t => {
        const oreGiorno = lezioniDi(t.id, giorno).filter(k => !classeFuori(iso, k.classe, k.ora)).map(k => k.ora);
        const aScuola = oreGiorno.length > 0;
        let posizione = 3;                                  // nessuna lezione quel giorno
        if (oreGiorno.some(o => o < l.ora) && oreGiorno.some(o => o > l.ora)) posizione = 0;   // ora buca
        else if (oreGiorno.includes(l.ora - 1) || oreGiorno.includes(l.ora + 1)) posizione = 1; // subito prima/dopo
        else if (aScuola) posizione = 2;
        const stessaClasse = D.lezioni.some(k => k.docente === t.id && k.classe === l.classe);
        const lib = liberato(iso, t.id, l.ora);
        return { t, aScuola: aScuola || lib, posizione, stessaClasse, liberato: lib, saldo: saldoDi(t.id) };
      })
      .sort((a, b) =>
        (b.liberato - a.liberato) ||
        (b.aScuola - a.aScuola) ||
        ((a.saldo ? a.saldo.attuale : Infinity) - (b.saldo ? b.saldo.attuale : Infinity)) ||
        (a.posizione - b.posizione) ||
        (b.stessaClasse - a.stessaClasse) ||
        nomeDocente(a.t.id).localeCompare(nomeDocente(b.t.id), 'it'));
  }

  const TESTI_POSIZIONE = [
    'ora buca: è già a scuola',
    'subito prima o dopo le sue lezioni',
    'a scuola, ma non in ore vicine',
    'nessuna lezione in questo giorno'
  ];

  // ---------- Foglio del conteggio su Google Drive (js/drive.js) ----------
  const suDrive = () => typeof FoglioDrive !== 'undefined' && FoglioDrive.configurato();
  const emailUtente = () => {
    try { const s = typeof Accesso !== 'undefined' && Accesso.sessione(); return s ? s.email : ''; } catch (e) { return ''; }
  };
  let driveLetto = false;   // in questa apertura della pagina il foglio è già stato riletto da Drive

  async function caricaDaDrive(manuale) {
    driveLetto = true;
    try {
      foglio = await FoglioDrive.leggi(emailUtente());
      salva('foglio', foglio);
      aggiornaAbbinamenti();
      disegnaTutto();
      if (manuale || foglio.soloLettura) avvisa(`Foglio del conteggio letto da Google Drive: ${foglio.docenti.length} docenti.` +
        (foglio.soloLettura ? ' È un file Excel: per aggiornarlo in automatico aprilo in Fogli e usa File > Salva come Fogli Google.' : ''));
      sistemaInSospeso();   // correzioni rimaste in sospeso (assenze di qui tolte da un altro dispositivo)
    } catch (errore) {
      console.error(errore);
      avvisa('Non riesco a leggere il foglio del conteggio da Drive: ' + errore.message + '.');
    }
  }

  // Perché non si può scrivere nel foglio del conteggio per questo docente ('' = si può)
  function motivoNonScrivibile(idDocente) {
    // nella versione smart dell'app i pulsanti e gli abbinamenti non ci sono: si rimanda alla scheda completa
    const dove = contenitore ? '' : ' nella scheda Sostituzioni di Orario Facile';
    if (!suDrive()) return 'in config.js non c\'è il foglio del conteggio su Drive';
    if (!foglio) return `il foglio del conteggio non è caricato: premi «☁️ Carica dal Drive»${dove}`;
    if (!foglio.driveId) return `il foglio del conteggio è stato caricato dal computer, non da Drive: premi «☁️ Carica dal Drive»${dove}`;
    const r = rigaDi(idDocente);
    if (!r) return `${nomeDocente(idDocente)} non è abbinato a nessuna riga del foglio: sceglilo in «Abbinamenti tra orario e foglio»${dove}`;
    // Controllo dell'abbinamento con il nome vero (file dei nomi): un abbinamento vecchio, fatto a mano
    // prima di ricaricare l'orario, potrebbe collegare il codice alla riga di un'altra persona
    const t = D && D.mappa.docente.get(idDocente);
    const vero = t && nomiVeri && nomiVeri.get(String(t.codice || t.nome || '').toUpperCase());
    if (vero && Foglio.semplifica(vero.cognome) !== Foglio.semplifica(r.cognome)) {
      return `abbinamento da controllare: ${t.codice || t.nome} è ${vero.cognome} ${vero.nome}, ma è abbinato alla riga ` +
        `${nomeRiga(r)} del foglio (correggilo in «Abbinamenti tra orario e foglio»${dove})`;
    }
    return '';
  }

  /*
    Aggiunge "quante" ore (anche negative) nella cella di un docente, nella colonna della settimana,
    leggendo prima il valore attuale (cella vuota = 0).
    Restituisce { ok: true, nuovo, cella } se ci è riuscito, oppure { ok: false, motivo } se non si può scrivere;
    se Google dà errore lo lancia a chi chiama.
  */
  async function segnaOre(idDocente, settimana, quante) {
    const motivo = motivoNonScrivibile(idDocente);
    if (motivo) return { ok: false, motivo };
    const r = rigaDi(idDocente);
    const nuovo = await FoglioDrive.aggiungi(foglio, r, settimana, quante, emailUtente());
    r.settimane[settimana] = nuovo;
    r.totale += quante;
    salva('foglio', foglio);
    return { ok: true, nuovo, cella: FoglioDrive.indirizzo ? FoglioDrive.indirizzo(foglio, r, settimana) : '' };
  }

  // Aggiunge (+1) o toglie (-1) l'ora di sostituzione nel foglio su Drive; restituisce il risultato di segnaOre
  async function segnaNelFoglio(s, quante) {
    try {
      return await segnaOre(s.sostituto, s.settimana, quante);
    } catch (errore) {
      console.error(errore);
      return { ok: false, motivo: errore.message };
    }
  }

  // ---------- Abilitazioni e registro nel Foglio Google delle sostituzioni (js/registro-drive.js) ----------
  // Chi può fare le sostituzioni è scritto nel foglio «Autorizzazioni»; le sostituzioni assegnate
  // vengono scritte nel foglio «Sostituzioni». Se in config.js manca "fileSostituzioni" tutto funziona come prima.
  const conRegistro = () => typeof RegistroDrive !== 'undefined' && RegistroDrive.configurato();
  // stato: 'da-verificare' | 'verifica' | 'si' | 'no' | 'errore'
  let abilitazione = { stato: 'da-verificare', nome: '', messaggio: '' };
  const puoFare = () => !conRegistro() || abilitazione.stato === 'si';

  async function verificaAbilitazione() {
    if (!conRegistro() || abilitazione.stato === 'verifica') return;
    abilitazione = { stato: 'verifica', nome: '', messaggio: '' };
    disegnaAbilitazione();
    try {
      const r = await RegistroDrive.abilitazione(emailUtente());
      abilitazione = { stato: r.abilitato ? 'si' : 'no', nome: r.nome || '', messaggio: r.motivo || '' };
    } catch (errore) {
      console.error(errore);
      abilitazione = { stato: 'errore', nome: '', messaggio: errore.message };
    }
    disegnaAbilitazione();
    // Chi è autorizzato vede i nomi veri dei docenti (servono anche per il foglio «Sostituzioni»)
    if (abilitazione.stato === 'si') { await preparaNomiVeri(); aggiorna(); }
  }

  // Mette i nomi veri nell'orario usato dalla scheda (come fa «👁 Nomi» di Orario Facile): il codice resta in .codice
  function applicaNomiVeri(orario) {
    if (!nomiVeri || !nomiVeri.size) return;
    orario.docente.forEach(t => {
      const n = !t.codice && nomiVeri.get(String(t.nome || '').trim().toUpperCase());
      if (n) { t.codice = t.nome; t.nome = (n.cognome + ' ' + n.nome).trim(); }
    });
  }

  // Vero se l'orario usa ancora le iniziali dei docenti ("F. A.") invece dei codici DOC01…:
  // in quel caso i nomi veri non si possono trovare (il file dei nomi collega solo i codici)
  const conIniziali = () => !!D && D.docente.some(t => /^(\p{L}{1,2}\.\s*)+$/u.test(t.codice || t.nome)) &&
    !D.docente.some(t => /^DOC\d+$/i.test(t.codice || t.nome));

  function disegnaAbilitazione() {
    if (!contenitore) { if (ui) ui.ridisegna(); return; }   // la scheda non c'è: disegna l'altra pagina
    const box = $('boxAbilitazione');
    box.hidden = !conRegistro();
    if (box.hidden) return;
    const email = emailUtente();
    const tuo = email ? ` (${email})` : '';
    const testi = {
      'da-verificare': `Solo chi è nel foglio «Autorizzazioni» può registrare assenze e assegnare sostituzioni. Premi il pulsante per controllare il tuo account${tuo}.`,
      verifica: 'Controllo in corso…',
      si: `✅ Sei abilitato${abilitazione.nome ? ': ' + abilitazione.nome : ''}. Le sostituzioni che assegni vengono scritte anche nel foglio «Sostituzioni».`,
      no: `⛔ Il tuo account${tuo} non è nel foglio «Autorizzazioni»${abilitazione.messaggio ? ' (' + abilitazione.messaggio + ')' : ''}. ` +
        'Puoi consultare, ma non registrare assenze né assegnare sostituzioni: chiedi a chi gestisce il foglio di aggiungerti.',
      errore: `⚠️ Non riesco a controllare l'abilitazione: ${abilitazione.messaggio}.`
    };
    $('statoAbilitazione').textContent = testi[abilitazione.stato];
    box.dataset.stato = abilitazione.stato;
    $('verifica').hidden = abilitazione.stato === 'si' || abilitazione.stato === 'verifica';
    $('verifica').textContent = abilitazione.stato === 'da-verificare' ? '🔐 Verifica la mia abilitazione' : '↻ Riprova';
    // Orario ancora con le iniziali: lo diciamo, perché così nel foglio non si possono scrivere i nomi veri
    $('avvisoIniziali').hidden = !conIniziali();
    contenitore.classList.toggle('sost-non-abilitato', !puoFare());
  }

  // Prima di registrare o assegnare: se non si è abilitati avvisa e restituisce false
  function controllaPermesso() {
    if (puoFare()) return true;
    avvisa(abilitazione.stato === 'no'
      ? 'Il tuo account non è autorizzato alle sostituzioni (foglio «Autorizzazioni»).'
      : 'Prima verifica la tua abilitazione: pulsante in cima alla scheda.');
    const box = contenitore && $('boxAbilitazione');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return false;
  }

  // Nel foglio su Drive vanno i NOMI VERI dei docenti (su GitHub e sul dispositivo restano i codici DOC01…).
  // Li prendiamo dal file riservato dei nomi (app/js/nomi.js): restano SOLO IN MEMORIA, mai salvati.
  let nomiVeri = null;   // Map "DOC07" -> { cognome, nome }
  async function preparaNomiVeri() {
    if (nomiVeri || typeof NomiDocenti === 'undefined' || !NomiDocenti.configurato()) return;
    try { nomiVeri = await NomiDocenti.carica(emailUtente(), RegistroDrive.permessi()); }
    catch (errore) { console.error(errore); nomiVeri = new Map(); }   // non riprovare a ogni sostituzione
  }
  function nomeVero(id) {
    const t = D && D.mappa.docente.get(id);
    const codice = t ? String(t.codice || t.nome || '').toUpperCase() : '';
    const n = nomiVeri && nomiVeri.get(codice);
    if (n) return (n.cognome + ' ' + n.nome).trim();
    if (rigaDi(id)) return nomeRiga(rigaDi(id));   // nome completo dal foglio del conteggio ore
    if (t && t.codice) return t.nome;              // con «👁 Nomi» attivo t.nome è già il nome vero
    return nomeDocente(id);                        // ultima possibilità: il codice
  }

  // Scrive la sostituzione come nuova riga del foglio «Sostituzioni»; restituisce true se ci è riuscito
  async function scriviNelRegistro(s) {
    if (!conRegistro()) return false;
    try {
      await preparaNomiVeri();
      await RegistroDrive.aggiungi({
        'Data': dataBreve(s.data), 'Giorno': giornoOrario(s.data) || '', 'Ora': testoOra(s.ora),
        'Classe': nome('classe', s.classe), 'Aula': nome('aula', s.aula), 'Materia': s.materia || '',
        'Docente assente': nomeVero(s.assente), 'Docente sostituto': nomeVero(s.sostituto),
        'Inserita da': abilitazione.nome || emailUtente(), 'Inserita il': new Date().toLocaleString('it-IT'),
        'ID': s.id
      }, emailUtente());
      return true;
    } catch (errore) {
      console.error(errore);
      avvisa('La sostituzione è assegnata, ma non ho potuto scriverla nel foglio «Sostituzioni»: ' + errore.message + '.');
      return false;
    }
  }

  // Toglie dal foglio «Sostituzioni» le righe di queste sostituzioni (se c'erano); restituisce true se è andato tutto bene
  async function togliDalRegistro(elenco) {
    const daTogliere = elenco.filter(s => s.nelRegistro);
    if (!daTogliere.length || !conRegistro()) return true;
    try {
      for (const s of daTogliere) await RegistroDrive.togli(s.id, emailUtente());
      return true;
    } catch (errore) {
      console.error(errore);
      avvisa('Non ho potuto togliere la sostituzione dal foglio «Sostituzioni»: ' + errore.message + '. Correggi il foglio a mano.');
      return false;
    }
  }

  /*
    Permesso: le ore di assenza sono ore a DEBITO da recuperare. Nel foglio del conteggio si toglie 1
    per ogni ora al docente assente, nella settimana del giorno (se la cella è vuota diventa -1).
    a.permessoSegnate = quante ore sono già state tolte nel foglio per questa assenza:
    si corregge solo la differenza (per esempio se si cambiano le ore o si toglie il permesso).
  */
  // Le correzioni dei permessi si fanno una alla volta, in fila: così due modifiche ravvicinate (anche di giorni
  // diversi della stessa settimana, che finiscono nella stessa cella) non leggono lo stesso valore
  // e non tolgono le ore due volte
  let filaPermessi = Promise.resolve();
  function aggiornaPermesso(a, oreGiuste) {
    const questa = filaPermessi.then(() => correggiPermesso(a, oreGiuste));
    filaPermessi = questa.catch(() => {});   // se una correzione fallisce, le successive partono lo stesso
    return questa;
  }

  async function correggiPermesso(a, oreGiuste) {
    const differenza = oreGiuste - (a.permessoSegnate || 0);   // calcolata quando tocca a lei, non prima
    if (!differenza) return;
    const sett = settimanaDi(a.data);
    try {
      const esito = await segnaOre(a.docente, sett, -differenza);
      if (esito.ok) {
        a.permessoSegnate = oreGiuste;
        salva('assenze', assenze);
        await aggiornaRigaRecupero(a);
        const dove = `nel foglio del conteggio (settimana ${sett}${esito.cella ? ', cella ' + esito.cella : ''}: ora ${esito.nuovo})`;
        avvisa(differenza > 0
          ? `Recupero: ${ore(differenza)} a debito per ${nomeDocente(a.docente)} ${dove}.`
          : `Recupero: ${differenza === -1 ? 'restituita' : 'restituite'} ${ore(-differenza)} a ${nomeDocente(a.docente)} ${dove}.`);
        disegnaTutto();
      } else {
        avvisa(`Recupero registrato, ma non posso aggiornare il foglio del conteggio (${esito.motivo}): ` +
          `${differenza > 0 ? 'togli' : 'aggiungi'} a mano ${ore(Math.abs(differenza))} nella settimana ${sett}.`);
      }
    } catch (errore) {
      console.error(errore);
      avvisa('Non ho potuto aggiornare il recupero nel foglio del conteggio: ' + errore.message + '. Correggi la cella a mano.');
    }
  }

  /*
    Foglio «Recuperi» (nel file delle sostituzioni, visibile solo agli autorizzati): una riga per ogni assenza a recupero
    con le ore già tolte nel foglio del conteggio. Serve a chi toglie l'assenza da un ALTRO dispositivo: legge lì quante
    ore restituire (nel file pubblicato il recupero non c'è, è un dato personale). Dopo ogni correzione del recupero la
    riga si riscrive: si toglie quella vecchia e, se restano ore tolte, se ne scrive una nuova.
    a.rigaRecupero = true se la riga c'è (resta solo su questo dispositivo, non si pubblica).
  */
  async function aggiornaRigaRecupero(a) {
    if (!conRegistro() || !a.id) return;
    try {
      if (a.rigaRecupero) await RegistroDrive.togli(a.id, emailUtente(), 'recuperi');
      a.rigaRecupero = false;
      if (a.permessoSegnate > 0) {
        await preparaNomiVeri();
        await RegistroDrive.aggiungi({
          'Data': dataBreve(a.data), 'Giorno': giornoOrario(a.data) || '', 'Docente': nomeVero(a.docente),
          'Ore di recupero': a.permessoSegnate, 'Inserita da': abilitazione.nome || emailUtente(),
          'Inserita il': new Date().toLocaleString('it-IT'), 'ID': a.id
        }, emailUtente(), 'recuperi');
        a.rigaRecupero = true;
      }
      salva('assenze', assenze);
    } catch (errore) {
      // non è grave: senza la riga, le ore le restituisce il dispositivo che ha registrato l'assenza (sistemaInSospeso)
      console.error(errore);
    }
  }

  /*
    Restituisce le ore di recupero di un'assenza registrata su un ALTRO dispositivo, leggendole dal foglio «Recuperi».
    Restituisce { stato: 'fatto', quante, esito } | { stato: 'nessuna' } (nessun recupero) |
    { stato: 'sconosciuto' } (la riga non c'è: se era un recupero ci pensa l'altro dispositivo) | { stato: 'errore', motivo }.
  */
  async function restituisciRecupero(voce) {
    if (!conRegistro() || !voce.id) return { stato: 'sconosciuto' };
    try {
      const riga = await RegistroDrive.leggi(voce.id, emailUtente(), 'recuperi');
      if (!riga) return { stato: 'sconosciuto' };
      const colonna = Object.keys(riga).find(t => /recuper/i.test(t));
      const quante = parseInt(colonna ? riga[colonna] : '', 10) || 0;
      if (quante <= 0) return { stato: 'nessuna' };
      const esito = await segnaOre(voce.docente, settimanaDi(voce.data), quante);
      if (!esito.ok) return { stato: 'errore', quante, motivo: esito.motivo };
      // ore restituite: la riga va tolta, altrimenti l'altro dispositivo le restituirebbe una seconda volta
      try { await RegistroDrive.togli(voce.id, emailUtente(), 'recuperi'); }
      catch (e) { console.error(e); return { stato: 'fatto', quante, esito, avviso: 'cancella a mano la sua riga dal foglio «Recuperi»' }; }
      return { stato: 'fatto', quante, esito };
    } catch (errore) {
      console.error(errore);
      return { stato: 'errore', motivo: errore.message };
    }
  }

  // Sostituzioni con un'operazione in corso sul foglio (assegnazione o annullamento): finché non finisce,
  // un secondo tocco sullo stesso pulsante viene ignorato (altrimenti l'ora verrebbe tolta o aggiunta due volte)
  const inCorso = new Set();

  /*
    Assegna una sostituzione. opzioni (facoltative):
    - reindirizzato: true = il sostituto è «liberato» da un'uscita didattica (la sua classe è fuori): copre in un'ora
      che è già sua, quindi NIENTE +1 nel foglio del conteggio;
    - uscita: l'ID dell'uscita didattica che l'ha proposta (per toglierla insieme all'uscita).
  */
  async function assegna(iso, l, idSostituto, opzioni) {
    if (!controllaPermesso()) return;
    if (sostituzioneDi(iso, l)) return;   // quest'ora è già assegnata (per esempio doppio tocco su «Assegna»)
    const op = opzioni || {};
    const s = {
      id: nuovoId(), data: iso, settimana: settimanaDi(iso), ora: l.ora,
      classe: l.classe, aula: l.aula, materia: l.materia,
      assente: l.assente, sostituto: idSostituto, riportata: false
    };
    if (op.reindirizzato) s.reindirizzato = true;
    if (op.uscita) s.uscita = op.uscita;
    // sciopero / assemblea (js/scioperi.js): la sostituzione è una VIGILANZA e non si pubblica con l'assente
    // (chi sciopera è un dato sindacale: nell'app si vede solo «Vigilanza» sulla classe)
    if (op.sciopero) { s.sciopero = op.sciopero; s.vigilanza = !op.lezione; }   // assemblea: si fa lezione (lezione: true)
    registro.push(s);
    salva('registro', registro);
    inCorso.add(s.id);   // finché il +1 non è scritto, questa sostituzione non si può annullare
    const testo = `${testoOra(l.ora)} in ${nome('classe', l.classe)}: sostituisce ${nomeDocente(idSostituto)}` +
      (s.reindirizzato ? ' (liberato dall\'uscita didattica: nessuna ora in più)' : '') + '.';
    if (!op.silenzioso) avvisa(testo);
    disegnaTutto();
    try {
      // foglio del conteggio su Google Drive: +1 nella settimana del docente che sostituisce
      // (non per chi è liberato da un'uscita didattica: è una sua ora di lezione)
      const fatto = [];
      const esito = s.reindirizzato ? { ok: false, motivo: '', nonServe: true } : await segnaNelFoglio(s, 1);
      if (esito.ok) {
        s.riportata = true; s.nelFoglio = true;
        fatto.push(`segnata nel foglio del conteggio (settimana ${s.settimana}${esito.cella ? ', cella ' + esito.cella : ''}: ora ${esito.nuovo})`);
      }
      // Foglio Google delle sostituzioni: una riga nel foglio «Sostituzioni»
      if (await scriviNelRegistro(s)) {
        s.nelRegistro = true;
        fatto.push('scritta nel foglio «Sostituzioni»');
      }
      if (fatto.length) salva('registro', registro);
      // Se il +1 non è stato scritto lo diciamo sempre, con il motivo: l'ora resta tra quelle da riportare
      const mancato = esito.ok || esito.nonServe ? '' : ` ⚠️ Non segnata nel foglio del conteggio: ${esito.motivo}. Resta tra le ore da riportare.`;
      if (!op.silenzioso || mancato) avvisa(testo + (fatto.length ? ' ' + fatto.join(' e ').replace(/^./, c => c.toUpperCase()) + '.' : '') + mancato);
    } finally {
      inCorso.delete(s.id);
      disegnaTutto();
    }
  }

  /*
    Annulla una sostituzione. "esterna" = registrata su un ALTRO dispositivo (arriva dal file pubblicato):
    non è nel registro di qui, quindi invece di toglierla dal registro la si ricorda tra le "annullate".
    Restituisce il messaggio per l'utente (un testo, quindi «vero») se la sostituzione è stata annullata, altrimenti false.
  */
  async function annulla(s, esterna) {
    if (!controllaPermesso()) return false;
    if (inCorso.has(s.id)) return false;   // c'è già un'operazione in corso su questa sostituzione (doppio tocco)
    inCorso.add(s.id);
    disegnaTutto();                  // il pulsante diventa «Annullo…» e non si può ripremere
    try {
      if (s.nelRegistro && !(await togliDalRegistro([s])) &&
        !confirm('Non riesco a togliere la sostituzione dal foglio «Sostituzioni». Annullarla comunque? Poi correggi il foglio a mano.')) return false;
      let dove = '';
      if (s.nelFoglio) {
        // segnata in automatico nel foglio su Drive: si toglie da lì (una sola volta)
        const esito = await segnaNelFoglio(s, -1);
        if (esito.ok) {
          s.nelFoglio = false;   // già tolta: se qualcosa va storto dopo, non si toglie una seconda volta
          dove = ` Tolta 1 ora a ${nomeDocente(s.sostituto)} nel foglio del conteggio (settimana ${s.settimana}${esito.cella ? ', cella ' + esito.cella : ''}: ora ${esito.nuovo}).`;
        } else if (!confirm(`Non riesco a togliere l'ora dal foglio del conteggio (${esito.motivo}). Annullare comunque la sostituzione? Poi correggi il foglio a mano.`)) return false;
      } else if (s.riportata && !confirm('Questa sostituzione è già stata riportata nel foglio. Annullarla comunque? Ricordati di correggere anche il foglio.')) return false;
      if (esterna) {
        // la ricordiamo tra le annullate: con la pubblicazione sparisce per tutti,
        // anche dal dispositivo che l'aveva registrata (vedi app/js/pubblica-sostituzioni.js)
        const annullate = Archivio.leggi('annullate', []);
        annullate.push({ id: s.id || '', data: s.data, ora: s.ora, classe: s.classe });
        Archivio.scrivi('annullate', annullate);
      } else {
        registro = registro.filter(x => x.id !== s.id);
        salva('registro', registro);
      }
      const messaggio = 'Sostituzione annullata.' + dove;
      avvisa(messaggio);
      return messaggio;
    } finally {
      inCorso.delete(s.id);
      disegnaTutto();
    }
  }

  /*
    Annulla una sostituzione vista nella tabella dell'app (tasto «✕ Annulla», app/js/viste.js).
    "voce" = { id, data, ora, classe, assente, sostituto, nelFoglio?, nelRegistro? } del file pubblicato o di qui.
    - registrata su questo dispositivo: la solita annulla();
    - registrata su un altro dispositivo: si tolgono l'ora dal foglio del conteggio e la riga dal foglio «Sostituzioni»
      (se il file pubblicato non dice il contrario, si suppone che l'altro dispositivo li avesse scritti).
    In tutti e due i casi al docente che sostituiva si toglie 1 ora nel foglio del conteggio (settimana della sostituzione).
  */
  async function annullaVoce(voce) {
    // Per togliere l'ora serve il foglio del conteggio: se su questo dispositivo non c'è ancora, lo leggo da Drive
    // (il valore della cella poi si rilegge comunque dal vivo, vedi FoglioDrive.aggiungi)
    if (suDrive() && (!foglio || !foglio.driveId) && FoglioDrive.pronto()) await caricaDaDrive(false);
    const qui = registro.find(x => (voce.id && x.id === voce.id) ||
      (x.data === voce.data && x.ora === voce.ora && x.classe === voce.classe));
    if (qui) return annulla(qui, false);
    const s = Object.assign({}, voce, {
      settimana: settimanaDi(voce.data),
      nelFoglio: voce.nelFoglio !== false,
      nelRegistro: voce.nelRegistro !== false && !!voce.id   // nel foglio «Sostituzioni» le righe si trovano per ID
    });
    return annulla(s, true);
  }

  // ---------- Assenze e sostituzioni di tutti: sceglierne una e annullarla per tutti ----------
  /*
    L'elenco di TUTTE le assenze e sostituzioni: quelle del file pubblicato su Drive (registrate su qualsiasi dispositivo)
    più quelle di questo dispositivo, senza quelle già annullate. Serve alla sezione «Assenze e sostituzioni di tutti»
    (qui nella scheda e nella pagina «Sostituzioni smart»): se ne sceglie una e la si annulla per tutti.
    tutte = { stato: 'mai' | 'carico' | 'ok' | 'errore', elenco: [sostituzioni], assenze: [assenze], messaggio }
    (ogni voce ha .qui = registrata su questo dispositivo)
  */
  let tutte = { stato: 'mai', elenco: [], assenze: [], messaggio: '' };
  const segnoSost = x => x.data + '|' + x.ora + '|' + x.classe;
  const segnoAss = x => x.data + '|' + x.docente;
  function leggiLocale(chiave) { try { return JSON.parse(localStorage.getItem(chiave) || '[]') || []; } catch (e) { return []; } }

  async function caricaTutte() {
    if (tutte.stato === 'carico') return;
    tutte = { stato: 'carico', elenco: tutte.elenco, assenze: tutte.assenze, messaggio: '' };
    disegnaTutto();
    let pub = { registro: [], annullate: [], assenze: [], assenzeAnnullate: [] }, messaggio = '', stato = 'ok';
    const lista = (o, k) => Array.isArray(o[k]) ? o[k] : [];
    if (typeof CONFIG !== 'undefined' && CONFIG.fileSostituzioniPubblicate && typeof Dati !== 'undefined' && Dati.leggiDrive) {
      try {
        const o = JSON.parse((await Dati.leggiDrive(CONFIG.fileSostituzioniPubblicate)) || '{}');
        pub = { registro: lista(o, 'registro'), annullate: lista(o, 'annullate'), assenze: lista(o, 'assenze'), assenzeAnnullate: lista(o, 'assenzeAnnullate') };
        // assenze e sostituzioni di QUESTO dispositivo annullate da qualcun altro: spariscono anche da qui
        // (l'evento "storage" finto fa rileggere assenze e registro, vedi collegaPulsanti/collega)
        if (typeof PubblicaSostituzioni !== 'undefined') PubblicaSostituzioni.applicaAnnullate(pub.annullate, pub.assenzeAnnullate);
      } catch (errore) {
        console.error(errore);
        stato = 'errore';
        messaggio = `non riesco a leggere le sostituzioni pubblicate su Drive (${errore.message}): vedi solo quelle di questo dispositivo`;
      }
    } else {
      messaggio = 'in config.js non c\'è il file delle sostituzioni pubblicate: vedi solo quelle di questo dispositivo';
    }
    // come nell'app (supplenze.js): vincono quelle di qui; spariscono quelle pubblicate da qui e poi annullate qui
    const id = new Set(registro.map(x => x.id)), segni = new Set(registro.map(segnoSost));
    const daQui = new Set(leggiLocale('sostituzioni.pubblicateDaQui'));
    const altre = pub.registro.filter(x => !(x.id && (id.has(x.id) || daQui.has(x.id))) && !segni.has(segnoSost(x)));
    let elenco = altre.map(x => Object.assign({}, x, { qui: false }))
      .concat(registro.map(x => Object.assign({}, x, { qui: true })));
    const annullate = pub.annullate.concat(Archivio.leggi('annullate', []));
    if (annullate.length && typeof PubblicaSostituzioni !== 'undefined') {
      const colpisce = PubblicaSostituzioni.colpita(annullate);
      elenco = elenco.filter(x => !colpisce(x));
    }
    elenco.sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.ora - b.ora ||
      nome('classe', a.classe).localeCompare(nome('classe', b.classe), 'it', { numeric: true }));
    // le assenze, con le stesse regole: vincono quelle di qui, spariscono quelle tolte (da qui o da altri)
    const idA = new Set(assenze.map(x => x.id)), segniA = new Set(assenze.map(segnoAss));
    let elencoA = pub.assenze.filter(x => !(x.id && (idA.has(x.id) || daQui.has(x.id))) && !segniA.has(segnoAss(x)))
      .map(x => Object.assign({}, x, { qui: false }))
      .concat(assenze.map(x => ({ id: x.id, data: x.data, docente: x.docente, ore: x.ore, qui: true })));
    const assenzeAnnullate = pub.assenzeAnnullate.concat(Archivio.leggi('assenzeAnnullate', []));
    if (assenzeAnnullate.length && typeof PubblicaSostituzioni !== 'undefined') {
      const colpisce = PubblicaSostituzioni.assenzaColpita(assenzeAnnullate);
      elencoA = elencoA.filter(x => !colpisce(x));
    }
    elencoA.sort((a, b) => String(a.data).localeCompare(String(b.data)) || nomeDocente(a.docente).localeCompare(nomeDocente(b.docente), 'it'));
    tutte = { stato, elenco, assenze: elencoA, messaggio };
    disegnaTutto();
  }

  /*
    Pubblica subito assenze e sostituzioni (pubblica-sostituzioni.js), così la modifica si vede su tutti i dispositivi,
    e mostra il messaggio. cosa = «la sostituzione», «l'assenza»… (per il testo).
  */
  async function pubblicaSubito(messaggio, cosa) {
    if (typeof PubblicaSostituzioni === 'undefined' || !PubblicaSostituzioni.configurato()) { avvisa(messaggio); return; }
    try {
      await PubblicaSostituzioni.unisciEPubblica(emailUtente());
      avvisa(messaggio + ` Pubblicato: ${cosa} sparisce per tutti.`);
    } catch (errore) {
      console.error(errore);
      avvisa(messaggio + ` ⚠️ Non sono riuscito a pubblicare (${errore.message}): premi «📤 Pubblica sostituzioni» ` +
        `(o «Pubblica ora» nell'app) per farla sparire anche agli altri.`);
    }
  }

  // La domanda di conferma prima di annullare per tutti
  function domandaPerTutti(v) {
    return `Annullare PER TUTTI questa sostituzione?\n\n${dataCorta(v.data)} · ${testoOra(v.ora)}\n` +
      `Classe ${nome('classe', v.classe)} · assente ${nomeDocente(v.assente)}\nSostituisce: ${nomeDocente(v.sostituto)}` +
      `${v.qui ? '' : ' (registrata su un altro dispositivo)'}\n\n` +
      `Se l'ora era stata segnata nel foglio del conteggio, a ${nomeDocente(v.sostituto)} verrà tolta 1 ora. ` +
      'La sostituzione sparisce dal foglio «Sostituzioni» e dall\'app per tutti.';
  }

  /*
    Annulla una sostituzione dell'elenco «Sostituzioni di tutti» e PUBBLICA subito, così sparisce per tutti.
    Il conteggio lo corregge annullaVoce (−1 al sostituto); la pubblicazione (pubblica-sostituzioni.js) toglie la
    sostituzione dal file e, se era di un altro dispositivo, la mette tra le «annullate».
  */
  async function annullaPerTutti(v) {
    const messaggio = await annullaVoce(v);
    if (!messaggio) return false;
    tutte.elenco = tutte.elenco.filter(x => x !== v);
    await pubblicaSubito(messaggio, 'la sostituzione');
    disegnaTutto();
    return true;
  }

  // ---------- Togliere un'assenza (anche registrata su un altro dispositivo) ----------
  // La domanda di conferma. quanteSost = sostituzioni che vengono annullate; recupero = true/false, null = non si sa
  function domandaAssenza(a, quanteSost, recupero, altroDispositivo) {
    return `Togliere ${altroDispositivo ? 'PER TUTTI ' : ''}l'assenza di ${nomeDocente(a.docente)}?\n\n` +
      `${dataCorta(a.data)} · ${(a.ore || []).map(n => n + 'ª').join(', ')} ora` +
      (altroDispositivo ? '\n(registrata su un altro dispositivo)' : '') + '\n\n' +
      (quanteSost ? `Vengono annullate anche ${quanteSost === 1 ? 'la sostituzione già assegnata' : quanteSost + ' sostituzioni già assegnate'}: ` +
        'a chi sostituiva si toglie l\'ora nel foglio del conteggio.\n' : '') +
      (recupero === true ? `Le ore di recupero tolte a ${nomeDocente(a.docente)} nel foglio del conteggio vengono restituite.\n`
        : recupero === null ? `Se era a recupero, le ore tolte a ${nomeDocente(a.docente)} nel foglio del conteggio vengono restituite.\n` : '') +
      'L\'assenza sparisce dall\'app per tutti.';
  }

  /*
    Toglie le sostituzioni di un'assenza tolta (o delle ore tolte a un'assenza), senza domande: per ognuna −1 al
    sostituto nel foglio del conteggio (se era stata segnata) e la riga dal foglio «Sostituzioni».
    Restituisce { tolte: quante ore tolte dal foglio, aMano: [correzioni da fare a mano] }.
  */
  async function togliSostituzioniCollegate(elenco) {
    const esito = { tolte: 0, aMano: [] };
    for (const s of elenco) {
      inCorso.add(s.id);
      try {
        if (s.nelFoglio) {
          const r = await segnaNelFoglio(s, -1);
          if (r.ok) { s.nelFoglio = false; esito.tolte++; }
          else esito.aMano.push(`togli 1 ora a ${nomeDocente(s.sostituto)} nella settimana ${s.settimana} (${r.motivo})`);
        } else if (s.riportata && !s.reindirizzato) {
          esito.aMano.push(`togli 1 ora a ${nomeDocente(s.sostituto)} nella settimana ${s.settimana} (era già stata riportata a mano)`);
        }
        await togliDalRegistro([s]);
      } finally {
        inCorso.delete(s.id);
      }
    }
    return esito;
  }

  // Il testo finale dopo aver tolto un'assenza
  function testoAssenzaTolta(a, quanteSost, esitoSost, testoRecupero) {
    let t = `Assenza di ${nomeDocente(a.docente)} tolta (${dataCorta(a.data)}).`;
    if (quanteSost) t += ` ${quanteSost === 1 ? 'Annullata 1 sostituzione' : 'Annullate ' + quanteSost + ' sostituzioni'}` +
      (esitoSost.tolte ? ` (−1 nel foglio del conteggio a chi sostituiva: ${ore(esitoSost.tolte)} in tutto)` : '') + '.';
    if (testoRecupero) t += ' ' + testoRecupero;
    if (esitoSost.aMano.length) t += ' ⚠️ Da correggere a mano nel foglio del conteggio: ' + esitoSost.aMano.join('; ') + '.';
    return t;
  }

  /*
    Toglie un'assenza di QUESTO dispositivo: restituisce le ore di recupero (se erano state tolte nel foglio del
    conteggio), annulla le sue sostituzioni (−1 a chi sostituiva) e pubblica subito, così sparisce per tutti.
    senzaDomande: true quando la toglie il modulo delle uscite didattiche (ha già chiesto conferma e pubblica lui).
    Restituisce il messaggio (vero) se l'ha tolta, altrimenti false.
  */
  async function togliAssenza(a, senzaDomande) {
    if (!controllaPermesso()) return false;
    if (inCorso.has(a.id)) return false;   // doppio tocco: c'è già un'operazione in corso su questa assenza
    const collegate = registro.filter(x => x.data === a.data && x.assente === a.docente);
    if (!senzaDomande && !confirm(domandaAssenza(a, collegate.length, !!a.permessoSegnate, false))) return false;
    inCorso.add(a.id);
    disegnaTutto();
    try {
      // recupero già segnato nel foglio del conteggio: le ore tolte vengono restituite (e la riga «Recuperi» sparisce)
      const recuperoPrima = a.permessoSegnate || 0;
      if (recuperoPrima) await aggiornaPermesso(a, 0).catch(() => {});
      const testoRecupero = !recuperoPrima ? ''
        : !a.permessoSegnate ? `Restituite ${ore(recuperoPrima)} di recupero a ${nomeDocente(a.docente)} nel foglio del conteggio.`
          : `⚠️ Non ho potuto restituire le ${ore(recuperoPrima)} di recupero: aggiungile a mano nel foglio del conteggio (settimana ${settimanaDi(a.data)}).`;
      const esito = await togliSostituzioniCollegate(collegate);
      // (per ID: nel frattempo assenze e registro possono essere stati riletti dalla memoria)
      const idColl = new Set(collegate.map(x => x.id));
      assenze = assenze.filter(x => x.id !== a.id);
      registro = registro.filter(x => !idColl.has(x.id));
      salva('assenze', assenze);
      salva('registro', registro);
      tutte.assenze = tutte.assenze.filter(x => x.id !== a.id);
      tutte.elenco = tutte.elenco.filter(x => !idColl.has(x.id));
      const messaggio = testoAssenzaTolta(a, collegate.length, esito, testoRecupero);
      if (senzaDomande) avvisa(messaggio);
      else await pubblicaSubito(messaggio, 'l\'assenza');
      return messaggio;
    } finally {
      inCorso.delete(a.id);
      disegnaTutto();
    }
  }

  /*
    Toglie PER TUTTI un'assenza vista nell'elenco «di tutti» o nella tabella dell'app (tasto «✕ Togli assenza»).
    voce = { id, data, docente, ore } del file pubblicato o di qui. Chiede conferma.
    - registrata su questo dispositivo: la solita togliAssenza();
    - registrata su un altro dispositivo: si annullano le sue sostituzioni (annullaVoce: −1 a chi sostituiva, riga tolta
      dal foglio «Sostituzioni»), si restituiscono le ore di recupero lette dal foglio «Recuperi», la si mette tra le
      «assenze annullate» e si pubblica: sparisce per tutti, anche dal dispositivo che l'aveva registrata.
  */
  async function togliAssenzaPerTutti(voce) {
    if (!controllaPermesso()) return false;
    const qui = assenze.find(x => voce.id && x.id === voce.id) || assenze.find(x => x.data === voce.data && x.docente === voce.docente);
    if (qui) return togliAssenza(qui, false);
    const chiave = 'A|' + (voce.id || segnoAss(voce));
    if (inCorso.has(chiave)) return false;
    // le sue sostituzioni stanno nel file pubblicato: se l'elenco di tutti non è ancora stato letto, lo leggo
    if (tutte.stato !== 'ok') await caricaTutte();
    const collegate = tutte.elenco.filter(v => v.data === voce.data && v.assente === voce.docente);
    if (!confirm(domandaAssenza(voce, collegate.length, null, true))) return false;
    inCorso.add(chiave);
    disegnaTutto();
    try {
      // per togliere e restituire ore serve il foglio del conteggio: se qui non c'è ancora, lo leggo da Drive
      if (suDrive() && (!foglio || !foglio.driveId) && FoglioDrive.pronto()) await caricaDaDrive(false);
      const esito = { tolte: 0, aMano: [] };
      for (const v of collegate) {
        const fatto = await annullaVoce(v);
        if (fatto) { if (/Tolta 1 ora/.test(fatto)) esito.tolte++; }
        else esito.aMano.push(`la sostituzione della ${v.ora}ª ora in ${nome('classe', v.classe)} non è stata annullata: annullala a parte`);
      }
      const r = await restituisciRecupero(voce);
      const testoRecupero = r.stato === 'fatto'
        ? `Restituite ${ore(r.quante)} di recupero a ${nomeDocente(voce.docente)} nel foglio del conteggio` +
          ` (settimana ${settimanaDi(voce.data)}${r.esito.cella ? ', cella ' + r.esito.cella : ''}: ora ${r.esito.nuovo}).` +
          (r.avviso ? ` ⚠️ Poi ${r.avviso}.` : '')
        : r.stato === 'errore' ? `⚠️ Non ho potuto restituire le ore di recupero (${r.motivo}): se era a recupero, lo farà il dispositivo che l'aveva registrata.`
          : r.stato === 'sconosciuto' ? 'Se era a recupero, le ore le restituisce il dispositivo che l\'aveva registrata, appena si aprono lì le sostituzioni.' : '';
      const annullate = Archivio.leggi('assenzeAnnullate', []);
      annullate.push({ id: voce.id || '', data: voce.data, docente: voce.docente });
      salva('assenzeAnnullate', annullate);
      tutte.assenze = tutte.assenze.filter(x => !(x.data === voce.data && x.docente === voce.docente));
      tutte.elenco = tutte.elenco.filter(x => !collegate.includes(x));
      const messaggio = testoAssenzaTolta(voce, collegate.length, esito, testoRecupero);
      await pubblicaSubito(messaggio, 'l\'assenza');
      return messaggio;
    } finally {
      inCorso.delete(chiave);
      disegnaTutto();
    }
  }

  /*
    Correzioni lasciate in sospeso (chiave "sostituzioni.daSistemare", le prepara PubblicaSostituzioni.applicaAnnullate):
    un'assenza registrata QUI è stata tolta da un altro dispositivo. Appena il foglio del conteggio è caricato da Drive:
    - recupero: si restituiscono le ore tolte (se non l'ha già fatto chi ha tolto l'assenza: in quel caso la riga del
      foglio «Recuperi» non c'è più);
    - sostituzione di quell'assenza che gli altri non vedevano: −1 al sostituto e riga tolta dal foglio «Sostituzioni».
  */
  let sistemando = false;
  async function sistemaInSospeso() {
    if (sistemando || !foglio || !foglio.driveId || !puoFare()) return;
    const coda = Archivio.leggi('daSistemare', []);
    if (!coda.length) return;
    sistemando = true;
    const fatte = [], aMano = [], finite = new Set();
    try {
      for (const x of coda) {
        try {
          if (x.tipo === 'recupero') {
            const conRiga = x.conRiga && conRegistro();
            if (conRiga && !(await RegistroDrive.leggi(x.id, emailUtente(), 'recuperi'))) { finite.add(x.chiave); continue; }
            const sett = settimanaDi(x.data);
            const esito = await segnaOre(x.docente, sett, x.ore);
            if (esito.ok) {
              fatte.push(`restituite ${ore(x.ore)} di recupero a ${nomeDocente(x.docente)} (settimana ${sett})`);
              if (conRiga) await RegistroDrive.togli(x.id, emailUtente(), 'recuperi').catch(e => console.error(e));
            } else aMano.push(`aggiungi ${ore(x.ore)} a ${nomeDocente(x.docente)} nella settimana ${sett} (${esito.motivo})`);
          } else if (x.tipo === 'sostituzione') {
            const esito = await togliSostituzioniCollegate([x]);
            if (esito.tolte) fatte.push(`tolta 1 ora a ${nomeDocente(x.sostituto)} (settimana ${x.settimana})`);
            aMano.push(...esito.aMano);
          }
          finite.add(x.chiave);
        } catch (errore) {
          console.error(errore);   // errore di Google: si riprova la prossima volta
        }
      }
      // si rilegge la coda: nel frattempo possono esserne arrivate altre
      Archivio.scrivi('daSistemare', Archivio.leggi('daSistemare', []).filter(x => !finite.has(x.chiave)));
      if (fatte.length || aMano.length) {
        avvisa('Assenze tolte da un altro dispositivo: ' + (fatte.length ? fatte.join('; ') + ' nel foglio del conteggio.' : '') +
          (aMano.length ? ' ⚠️ Da correggere a mano: ' + aMano.join('; ') + '.' : ''));
      }
    } finally {
      sistemando = false;
    }
  }

  // Disegno della sezione «Assenze e sostituzioni di tutti» nella scheda di Orario Facile: giorno per giorno,
  // prima le assenze («Togli per tutti») e poi le sostituzioni («Annulla per tutti»)
  function disegnaTutte() {
    const box = $('tutte');
    if (!box) return;
    box.replaceChildren();
    $('caricaTutte').disabled = tutte.stato === 'carico';
    $('caricaTutte').textContent = tutte.stato === 'mai' ? '👥 Mostra le assenze e le sostituzioni di tutti'
      : tutte.stato === 'carico' ? 'Leggo…' : '↻ Aggiorna l\'elenco';
    if (tutte.messaggio) box.append(el('p', { class: 'hint' }, '⚠️ ' + tutte.messaggio + '.'));
    if (tutte.stato === 'mai') return;
    if (!tutte.elenco.length && !tutte.assenze.length) { box.append(el('p', { class: 'hint' }, 'Nessuna assenza né sostituzione registrata.')); return; }
    const giorni = [...new Set(tutte.assenze.map(a => a.data).concat(tutte.elenco.map(v => v.data)))].sort();
    giorni.forEach(g => {
      box.append(el('h4', {}, dataCorta(g)));
      const assenzeG = tutte.assenze.filter(a => a.data === g);
      if (assenzeG.length) box.append(el('ul', { class: 'sost-tutte' }, assenzeG.map(a => {
        const occupato = inCorso.has(a.id) || inCorso.has('A|' + (a.id || segnoAss(a)));
        return el('li', { class: 'sost-tutte-assenza' },
          el('span', {}, el('b', {}, nomeDocente(a.docente)), ' assente · ', (a.ore || []).map(n => n + 'ª').join(', '), ' ora ',
            el('span', { class: 'tag' }, a.qui ? 'registrata qui' : 'da un altro dispositivo')),
          el('button', { type: 'button', class: 'btn danger sm', disabled: occupato || !puoFare(),
            'aria-label': 'Togli per tutti l\'assenza di ' + nomeDocente(a.docente) + ' di ' + dataCorta(a.data),
            onclick: () => togliAssenzaPerTutti(a) }, occupato ? 'Aggiorno i fogli…' : 'Togli per tutti'));
      })));
      const sostG = tutte.elenco.filter(v => v.data === g);
      if (sostG.length) box.append(el('ul', { class: 'sost-tutte' }, sostG.map(v => {
        const occupato = inCorso.has(v.id);
        return el('li', {},
          el('span', {}, el('b', {}, `${v.ora}ª ora · ${nome('classe', v.classe)}`),
            ` · ${nomeDocente(v.assente)} assente → `, el('b', {}, nomeDocente(v.sostituto)), ' ',
            el('span', { class: 'tag' }, v.qui ? 'registrata qui' : 'da un altro dispositivo')),
          el('button', { type: 'button', class: 'btn danger sm', disabled: occupato || !puoFare(),
            onclick: () => { if (confirm(domandaPerTutti(v))) annullaPerTutti(v); } },
            occupato ? 'Aggiorno i fogli…' : 'Annulla per tutti'));
      })));
    });
  }

  // ---------- Disegno della sezione 1: dati ----------
  function disegnaDati() {
    $('statoOrario').textContent = `Orario usato: quello di Orario Facile (${D.docente.length} docenti, ${D.lezioni.length} lezioni). ` +
      'Se modifichi l\'orario, le proposte si aggiornano da sole. Versione della scheda: ' + VERSIONE + '.';

    const stato = $('statoFoglio');
    stato.replaceChildren();
    if (foglio) {
      const inizio = foglio.inizio || INIZIO_PREDEFINITO;
      stato.append(
        foglio.driveId ? '☁️ Su Google Drive: ' : '',
        el('strong', {}, foglio.file), ` (foglio "${foglio.foglio}"): ${foglio.docenti.length} righe, ` +
        `${foglio.driveId ? 'letto' : 'caricato'} il ${new Date(foglio.caricato).toLocaleString('it-IT')}. ` +
        `La settimana 1 inizia lunedì ${dataBreve(inizio)}` + (foglio.inizio ? '.' : ' (valore predefinito).'),
        foglio.driveId && !foglio.soloLettura ? ' Le sostituzioni assegnate vengono segnate nel foglio in automatico (+1 nella settimana).' : '',
        foglio.soloLettura ? el('span', { class: 'sost-attenzione' }, ' È un file Excel: si può solo leggere. Per aggiornarlo in automatico aprilo in Fogli e usa File > Salva come Fogli Google.') : '');
    } else {
      stato.textContent = 'Nessun foglio caricato: i docenti liberi vengono proposti lo stesso, ma senza sapere chi è a debito.';
    }
    // pulsante per leggere (o rileggere) il foglio dal Drive: serve se il permesso di Google non c'è ancora
    $('caricaDrive').hidden = !suDrive();
    $('caricaDrive').textContent = foglio && foglio.driveId ? '🔄 Rileggi dal Drive' : '☁️ Carica dal Drive';
    disegnaAbbinamenti();
  }

  function disegnaAbbinamenti() {
    const box = $('abbinamenti');
    box.replaceChildren();
    if (!D) return;
    if (!foglio) {
      $('riassuntoAbbinamenti').textContent = 'Abbinamenti tra orario e foglio (carica prima il foglio)';
      return;
    }
    const daControllare = D.docente.filter(t => !(abbinati.get(t.id) || {}).chiave).length;
    $('riassuntoAbbinamenti').textContent = `Abbinamenti tra orario e foglio: ${D.docente.length - daControllare} su ${D.docente.length} abbinati` +
      (daControllare ? ` · ${daControllare} da controllare` : ' ✔');

    const righeOrdinate = foglio.docenti.slice().sort((a, b) => nomeRiga(a).localeCompare(nomeRiga(b), 'it'));
    // Docenti dell'orario indicati solo con il codice (DOC01…): senza i nomi veri non si possono abbinare da soli
    const soloCodici = D.docente.some(t => /^DOC\d+$/i.test(t.nome));
    const tabella = el('table', { class: 'sost-tabella' },
      el('caption', {}, 'Ogni docente dell\'orario è collegato a una riga del foglio. Se è sbagliato o manca, sceglilo dall\'elenco.'),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Docente nell\'orario'),
        el('th', { scope: 'col' }, 'Riga del foglio'),
        el('th', { scope: 'col' }, 'Stato'))),
      el('tbody', {}, D.docente.map(t => {
        const a = abbinati.get(t.id) || {};
        const idSelect = 'abb-' + t.id;
        const scelta = el('select', {
          id: idSelect,
          onchange: e => {
            if (e.target.value === '__auto') delete manuali[t.id];
            else manuali[t.id] = e.target.value;
            salva('abbinamenti', manuali);
            aggiornaAbbinamenti();
            disegnaTutto();
          }
        },
        el('option', { value: '__auto' }, 'Automatico'),
        el('option', { value: '' }, '— nessuna riga —'),
        righeOrdinate.map(r => el('option', { value: r.chiave }, nomeRiga(r) || r.cognome)));
        scelta.value = a.come === 'manuale' ? (a.chiave || '') : '__auto';
        const stati = {
          manuale: 'scelto a mano',
          automatico: '✔ ' + (a.chiave ? nomeRiga(righePerChiave.get(a.chiave)) : ''),
          ambiguo: '⚠ più righe possibili: sceglilo',
          mancante: '⚠ non trovato nel foglio'
        };
        return el('tr', {},
          el('th', { scope: 'row' }, el('label', { for: idSelect }, t.nome + (t.codice && t.codice !== t.nome ? ` (${t.codice})` : ''))),
          el('td', {}, scelta),
          el('td', { class: a.chiave || a.come === 'manuale' ? '' : 'sost-attenzione' }, stati[a.come] || ''));
      })));
    if (soloCodici) box.append(el('p', { class: 'hint' }, 'Nell\'orario i docenti sono codici (DOC01…): premi «👁 Nomi» in alto per abbinarli da soli alle righe del foglio (serve il permesso sul file dei nomi), oppure sceglili a mano.'));
    box.append(el('div', { class: 'tablewrap' }, tabella));
  }

  // ---------- Disegno della sezione 2: giorno e assenze ----------
  function disegnaGiorno() {
    $('data').value = dataScelta;
    const giorno = giornoOrario(dataScelta);
    const sett = settimanaDi(dataScelta);
    $('descrizioneGiorno').textContent = dataLunga(dataScelta) +
      (sett >= 1 ? ` · settimana ${sett}` : '') + (giorno ? '' : ' · nessuna lezione in questo giorno');

    // Elenco dei docenti per il modulo (mantiene la scelta fatta)
    const select = $('docenteAssente');
    const prima = select.value;
    select.replaceChildren(el('option', { value: '' }, '— scegli —'),
      ...D.docente.slice().sort((a, b) => nomeDocente(a.id).localeCompare(nomeDocente(b.id), 'it')).map(t => el('option', { value: t.id }, nomeDocente(t.id) + (conSigla(t) ? ` (${sigla(t)})` : ''))));
    select.value = D.mappa.docente.has(prima) ? prima : '';
    select.disabled = !giorno;
    disegnaOreAssenza();

    // Assenze già registrate in questo giorno
    const box = $('elencoAssenze');
    box.replaceChildren();
    const elenco = assenzeDel(dataScelta);
    if (!elenco.length) {
      box.append(el('p', { class: 'hint' }, 'Nessuna assenza registrata in questo giorno.'));
      return;
    }
    box.append(el('h3', {}, 'Assenti'), el('ul', { class: 'sost-assenze' }, elenco.map(a =>
      el('li', {},
        el('span', {}, el('strong', {}, nomeDocente(a.docente)), ' – ', a.ore.map(n => n + 'ª').join(', '), ' ora',
          a.uscita ? el('span', { class: 'tag' }, a.come === 'accompagna' ? '🚌 accompagna l\'uscita' : '🚌 classe in uscita: entra dopo / esce prima') : null,
          a.permesso ? el('span', { class: 'tag' }, a.permessoSegnate ? `recupero · −${a.permessoSegnate} nel foglio` : 'recupero') : null),
        el('button', {
          type: 'button', class: 'btn ghost sm', disabled: inCorso.has(a.id),
          'aria-label': 'Togli l\'assenza di ' + nomeDocente(a.docente) + ' (anche per tutti)',
          onclick: () => togliAssenza(a)
        }, inCorso.has(a.id) ? 'Aggiorno i fogli…' : 'Togli')))));
  }

  // Le caselle con le ore di lezione del docente scelto
  function disegnaOreAssenza() {
    const box = $('oreAssenza');
    box.replaceChildren();
    const id = $('docenteAssente').value;
    const giorno = giornoOrario(dataScelta);
    if (!id || !giorno) return;
    const lezioni = lezioniDi(id, giorno);
    if (!lezioni.length) {
      box.append(el('p', { class: 'hint' }, 'Questo docente non ha lezioni in questo giorno: non serve nessuna sostituzione.'));
      return;
    }
    // Se il docente è già segnato assente, partiamo dalle sue ore; altrimenti tutte spuntate
    const gia = new Set((assenzeDel(dataScelta).find(a => a.docente === id) || { ore: [] }).ore);
    box.append(el('fieldset', { class: 'sost-ore' },
      el('legend', {}, 'Ore di assenza'),
      lezioni.map(l => el('label', { class: 'sost-casella' },
        el('input', { type: 'checkbox', name: 'ora', value: l.ora, checked: gia.size ? gia.has(l.ora) : true }),
        ` ${testoOra(l.ora)} · ${nome('classe', l.classe)} ${l.materia}` + (l.aula ? ` · ${nome('aula', l.aula)}` : '')))));
    // Assente più giorni: gli altri giorni della settimana in cui ha lezione (tutte le ore)
    const altri = altriGiorniDi(dataScelta, id);
    if (altri.length) {
      box.append(el('fieldset', { class: 'sost-ore' },
        el('legend', {}, 'Assente anche in altri giorni di questa settimana? (tutte le ore di quel giorno)'),
        altri.map(g => {
          const gia = assenzeDel(g.iso).some(a => a.docente === id);
          return el('label', { class: 'sost-casella' },
            el('input', { type: 'checkbox', name: 'giorno', value: g.iso }),
            ` ${dataCorta(g.iso)} · ${ore(g.ore.length)}` + (gia ? ' (già segnato assente)' : ''));
        })));
    }
  }

  // Segna (o aggiorna) l'assenza di un docente in UN giorno, senza messaggi né disegno; restituisce l'assenza
  function segnaAssenza(iso, id, oreScelte, permesso) {
    // Se il docente era già assente quel giorno, aggiorniamo le sue ore
    let assenza = assenzeDel(iso).find(a => a.docente === id);
    if (assenza) assenza.ore = oreScelte.slice().sort((a, b) => a - b);
    else { assenza = { id: nuovoId(), data: iso, docente: id, ore: oreScelte.slice().sort((a, b) => a - b) }; assenze.push(assenza); }
    assenza.permesso = permesso;
    // Le sostituzioni già assegnate per ore tolte non servono più: spariscono e, se erano segnate nel foglio del
    // conteggio, a chi sostituiva si toglie l'ora (e la riga dal foglio «Sostituzioni»); lo si fa dopo, senza aspettare
    const superate = registro.filter(x => x.data === iso && x.assente === id && !oreScelte.includes(x.ora));
    registro = registro.filter(x => !superate.includes(x));
    if (superate.length) {
      togliSostituzioniCollegate(superate).then(esito => {
        avvisa(`${nomeDocente(id)} non è più assente in ${superate.length === 1 ? '1 ora' : superate.length + ' ore'}: ` +
          `${superate.length === 1 ? 'annullata la sostituzione' : 'annullate le sostituzioni'}` +
          (esito.tolte ? ` (−1 nel foglio del conteggio a chi sostituiva: ${ore(esito.tolte)} in tutto)` : '') + '.' +
          (esito.aMano.length ? ' ⚠️ Da correggere a mano: ' + esito.aMano.join('; ') + '.' : ''));
        disegnaTutto();
      });
    }
    return assenza;
  }

  /*
    Registra (o aggiorna) l'assenza di un docente: la usano il modulo della scheda e la pagina «Sostituzioni smart».
    - iso, oreScelte: il giorno scelto e le ore spuntate
    - altriGiorni: altre date della stessa settimana ("2026-09-29"…) in cui il docente è assente TUTTO il giorno
    Restituisce true se l'ha registrata.
  */
  // extra (facoltativo): { uscita: ID, come: 'accompagna' | 'recupero' } per le assenze create da un'uscita didattica;
  // con extra.silenzioso non compare il messaggio
  function registraAssenzaDi(iso, id, oreScelte, permesso, altriGiorni, extra) {
    if (!controllaPermesso()) return false;
    const giorni = [{ iso, ore: oreScelte }].concat(altriGiorniDi(iso, id)
      .filter(g => (altriGiorni || []).includes(g.iso)).map(g => ({ iso: g.iso, ore: g.ore })));
    const segnate = giorni.map(g => segnaAssenza(g.iso, id, g.ore, permesso));
    if (extra) segnate.forEach(a => { if (extra.uscita) a.uscita = extra.uscita; if (extra.come) a.come = extra.come; });
    salva('assenze', assenze);
    salva('registro', registro);
    const totale = giorni.reduce((n, g) => n + g.ore.length, 0);
    if (!(extra && extra.silenzioso)) avvisa(giorni.length === 1
      ? `Assenza registrata: ${nomeDocente(id)}, ${ore(totale)}${permesso ? ' (recupero)' : ''}.`
      : `Assenza registrata: ${nomeDocente(id)} in ${giorni.length} giorni (${giorni.map(g => dataCorta(g.iso)).join(', ')}), ` +
        `${ore(totale)} in tutto${permesso ? ' (recupero)' : ''}. Con i pulsanti dei giorni in «Ore da coprire» passi da un giorno all'altro.`);
    disegnaTutto();
    // Permesso: -1 per ogni ora nel foglio del conteggio (o si restituiscono le ore se il permesso è stato tolto)
    segnate.forEach(a => aggiornaPermesso(a, permesso ? a.ore.length : 0));
    return true;
  }

  // Il modulo "Assenze del giorno" della scheda
  function registraAssenza(evento) {
    evento.preventDefault();
    if (!controllaPermesso()) return;
    const id = $('docenteAssente').value;
    if (!id) { avvisa('Scegli il docente assente.'); $('docenteAssente').focus(); return; }
    const oreScelte = [...document.querySelectorAll('#sost-oreAssenza input[name="ora"]:checked')].map(c => Number(c.value));
    if (!oreScelte.length) { avvisa('Spunta almeno un\'ora di assenza.'); return; }
    const altriGiorni = [...document.querySelectorAll('#sost-oreAssenza input[name="giorno"]:checked')].map(c => c.value);
    if (!registraAssenzaDi(dataScelta, id, oreScelte, $('permesso').checked, altriGiorni)) return;
    $('docenteAssente').value = '';
    $('permesso').checked = true;   // per la prossima assenza il permesso torna spuntato
    disegnaTutto();
    $('titoloCoprire').scrollIntoView({ behavior: 'smooth' });
  }

  // Quante ore sono da coprire e quante già coperte in un giorno
  function contaGiorno(iso) {
    const elenco = oreDaCoprire(iso);
    const coperte = elenco.filter(l => sostituzioneDi(iso, l)).length;
    return { totale: elenco.length, coperte, mancano: elenco.length - coperte };
  }

  // ---------- Disegno della sezione 3: ore da coprire ----------
  // In cima, un pulsante per ogni giorno della settimana con le ore ancora da coprire: si passa da un giorno all'altro
  function disegnaSettimana() {
    const box = $('settimana');
    box.replaceChildren();
    const giorni = giorniSettimana(dataScelta);
    if (!giorni.some(g => contaGiorno(g.iso).totale)) return;   // nessuna assenza in settimana: niente pulsanti
    box.append(el('span', { class: 'hint' }, 'Settimana: '), ...giorni.map(g => {
      const c = contaGiorno(g.iso);
      const testo = c.mancano ? `${c.mancano} da coprire` : c.totale ? '✔ coperte' : 'nessuna';
      return el('button', {
        type: 'button', class: 'btn sm' + (g.iso === dataScelta ? '' : ' ghost') + (c.mancano ? ' sost-giorno-scoperto' : ''),
        'aria-current': g.iso === dataScelta ? 'date' : null,
        onclick: () => { dataScelta = g.iso; aperte.clear(); disegnaTutto(); }
      }, `${dataCorta(g.iso)} · ${testo}`);
    }));
  }

  function disegnaCoprire() {
    disegnaSettimana();
    const box = $('oreDaCoprire');
    box.replaceChildren();
    const elenco = oreDaCoprire(dataScelta);
    if (!elenco.length) {
      box.append(el('p', { class: 'hint' }, 'Nessuna ora da coprire in questo giorno.'));
      disegnaStampa([]);
      return;
    }
    elenco.forEach(l => box.append(schedaOra(l)));
    disegnaStampa(elenco);
  }

  function schedaOra(l) {
    const chiave = [dataScelta, l.ora, l.classe, l.assente].join('|');
    const s = sostituzioneDi(dataScelta, l);
    const titolo = el('h3', {}, `${testoOra(l.ora)} · ${nome('classe', l.classe)}`);
    const dettagli = el('p', { class: 'sost-dettagli' },
      [l.materia, l.aula ? nome('aula', l.aula) : '', 'assente: ' + nomeDocente(l.assente)].filter(Boolean).join(' · '));

    // Compresenza: in classe c'è già un altro docente presente
    const altri = D.lezioni.filter(k => k.giorno === l.giorno && k.ora === l.ora && k.classe === l.classe &&
      k.docente !== l.assente && !assentiAllOra(dataScelta, l.ora).has(k.docente));
    const compresenza = altri.length
      ? el('p', { class: 'hint' }, `ℹ️ In classe c'è anche ${altri.map(k => nomeDocente(k.docente)).join(', ')} (compresenza): forse la sostituzione non serve.`)
      : null;

    if (s) {
      const saldo = saldoDi(s.sostituto);
      return el('article', { class: 'sost-ora coperta' }, titolo, dettagli, compresenza,
        el('p', { class: 'sost-sostituto' }, '✔ Sostituisce ', el('strong', {}, nomeDocente(s.sostituto)), ' ', etichettaSaldo(saldo),
          s.reindirizzato ? el('span', { class: 'tag' }, '🚌 liberato dall\'uscita: nessuna ora in più') : null,
          s.riportata ? el('span', { class: 'tag' }, 'già riportata nel foglio') : null),
        // mentre il foglio viene aggiornato il pulsante è spento, così non si preme due volte
        el('button', { type: 'button', class: 'btn ghost sm', disabled: inCorso.has(s.id), onclick: () => annulla(s) },
          inCorso.has(s.id) ? 'Aggiorno il foglio…' : 'Annulla la sostituzione'));
    }

    const tutti = candidati(dataScelta, l);
    const aScuola = tutti.filter(c => c.aScuola);
    const aCasa = tutti.filter(c => !c.aScuola);
    const aperta = aperte.has(chiave);
    const visibili = aperta ? aScuola : aScuola.slice(0, PROPOSTE_VISIBILI);

    const voce = c => el('li', { class: 'sost-candidato' },
      el('div', { class: 'sost-info' },
        el('strong', {}, nomeDocente(c.t.id)),
        conSigla(c.t) ? el('span', { class: 'mini' }, ` (${sigla(c.t)})`) : null,
        el('span', { class: 'sost-etichette' },
          etichettaSaldo(c.saldo),
          c.liberato ? el('span', { class: 'tag ok' }, '🚌 libero per l\'uscita: nessuna ora in più') : el('span', { class: 'tag' }, TESTI_POSIZIONE[c.posizione]),
          c.stessaClasse ? el('span', { class: 'tag' }, 'conosce la classe') : null)),
      el('button', {
        type: 'button', class: 'btn sm',
        'aria-label': `Assegna la ${l.ora}ª ora in ${nome('classe', l.classe)} a ${nomeDocente(c.t.id)}`,
        onclick: () => assegna(dataScelta, l, c.t.id, c.liberato ? { reindirizzato: true } : undefined)
      }, 'Assegna'));

    const contenuto = [];
    if (!tutti.length) contenuto.push(el('p', { class: 'sost-attenzione' }, 'Nessun docente libero in quest\'ora.'));
    if (visibili.length) contenuto.push(el('ol', { class: 'sost-candidati' }, visibili.map(voce)));
    else if (tutti.length) contenuto.push(el('p', { class: 'hint' }, 'Nessun docente già a scuola è libero in quest\'ora.'));
    if (aperta && aCasa.length) {
      contenuto.push(el('h4', {}, 'Senza lezioni in questo giorno (dovrebbero venire apposta)'),
        el('ol', { class: 'sost-candidati' }, aCasa.map(voce)));
    }
    const nascosti = aScuola.length - visibili.length + (aperta ? 0 : aCasa.length);
    if (nascosti > 0 || aperta) {
      contenuto.push(el('button', {
        type: 'button', class: 'btn ghost sm', 'aria-expanded': String(aperta),
        onclick: () => { aperta ? aperte.delete(chiave) : aperte.add(chiave); disegnaCoprire(); }
      }, aperta ? 'Mostra meno' : `Mostra tutti i docenti liberi (${tutti.length})`));
    }
    return el('article', { class: 'sost-ora' }, titolo, dettagli, compresenza, contenuto);
  }

  // Tabella riassuntiva del giorno (è anche quella che si stampa)
  function disegnaStampa(elenco) {
    const box = $('stampaGiorno');
    box.replaceChildren();
    // anche i cambi d'aula del giorno finiscono nella stampa (tabella preparata da js/cambi-aula.js)
    const cambi = typeof CambiAula !== 'undefined' ? CambiAula.tabellaStampa(dataScelta) : '';
    if (cambi) { const d = el('div', { class: 'tablewrap' }); d.innerHTML = cambi; box.append(d); }
    // e le uscite didattiche: classi fuori, docenti a disposizione, chi entra dopo o esce prima (js/uscite.js)
    const uscite = conUscite() ? Uscite.tabellaStampa(dataScelta) : '';
    if (uscite) { const d = el('div', { class: 'tablewrap' }); d.innerHTML = uscite; box.append(d); }
    if (!elenco.length) return;
    box.prepend(el('div', { class: 'tablewrap' }, el('table', { class: 'sost-tabella' },
      el('caption', {}, 'Sostituzioni di ' + dataLunga(dataScelta)),
      el('thead', {}, el('tr', {}, ['Ora', 'Classe', 'Aula', 'Materia', 'Assente', 'Sostituto']
        .map(t => el('th', { scope: 'col' }, t)))),
      el('tbody', {}, elenco.map(l => {
        const s = sostituzioneDi(dataScelta, l);
        return el('tr', {},
          el('th', { scope: 'row' }, testoOra(l.ora)),
          el('td', {}, nome('classe', l.classe)),
          el('td', {}, l.aula ? nome('aula', l.aula) : ''),
          el('td', {}, l.materia),
          el('td', {}, nomeDocente(l.assente)),
          el('td', { class: s ? '' : 'sost-attenzione' }, s ? nomeDocente(s.sostituto) : 'DA COPRIRE'));
      })))));
  }

  // ---------- Disegno della sezione 4: saldi ----------
  function disegnaSaldi() {
    const box = $('saldi');
    box.replaceChildren();
    if (!foglio) {
      box.append(el('p', { class: 'hint' }, 'Carica il foglio del conteggio ore per vedere il saldo di ogni docente.'));
      return;
    }
    const collegate = new Set([...abbinati.values()].map(a => a.chiave).filter(Boolean));
    const righe = foglio.docenti.map(r => {
      const extra = daRiportarePer(r.chiave);
      return { r, extra, attuale: r.totale + extra };
    }).sort((a, b) => a.attuale - b.attuale || nomeRiga(a.r).localeCompare(nomeRiga(b.r), 'it'));

    box.append(el('div', { class: 'tablewrap' }, el('table', { class: 'sost-tabella' },
      el('caption', {}, 'Dal più alto debito al più alto credito. Negativo = ore a debito, positivo = ore a credito.'),
      el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Docente'),
        el('th', { scope: 'col' }, 'Totale nel foglio'),
        el('th', { scope: 'col' }, 'Sostituzioni da riportare'),
        el('th', { scope: 'col' }, 'Saldo attuale'))),
      el('tbody', {}, righe.map(x => el('tr', {},
        el('th', { scope: 'row' }, nomeRiga(x.r) || x.r.cognome,
          collegate.has(x.r.chiave) ? null : el('span', { class: 'mini' }, ' (non nell\'orario)')),
        el('td', { class: 'num' }, conSegno(x.r.totale)),
        el('td', { class: 'num' }, x.extra ? '+' + x.extra : ''),
        el('td', { class: 'num' }, etichettaSaldo({ attuale: x.attuale }))))))));
  }

  // ---------- Disegno della sezione 5: da riportare nel foglio ----------
  // Raggruppa le sostituzioni non ancora riportate per settimana e docente
  function riepilogoDaRiportare() {
    const gruppi = new Map();
    registro.filter(x => !x.riportata && !x.reindirizzato).forEach(x => {
      const r = rigaDi(x.sostituto);
      const k = x.settimana + '|' + (r ? r.chiave : 'orario:' + x.sostituto);
      if (!gruppi.has(k)) gruppi.set(k, { settimana: x.settimana, riga: r, id: x.sostituto, ore: 0 });
      gruppi.get(k).ore++;
    });
    return [...gruppi.values()].sort((a, b) => a.settimana - b.settimana ||
      (a.riga ? nomeRiga(a.riga) : nomeDocente(a.id)).localeCompare(b.riga ? nomeRiga(b.riga) : nomeDocente(b.id), 'it'));
  }

  function disegnaRiportare() {
    const box = $('daRiportare');
    box.replaceChildren();
    const gruppi = riepilogoDaRiportare();
    if (!gruppi.length) {
      box.append(el('p', { class: 'hint' }, 'Nessuna ora da riportare nel foglio.'));
      return;
    }
    box.append(
      el('p', {}, 'Da aggiungere nel foglio, nella colonna della settimana (ogni ora di sostituzione vale +1):'),
      el('div', { class: 'tablewrap' }, el('table', { class: 'sost-tabella' },
        el('caption', {}, 'Ore di sostituzione non ancora riportate nel foglio'),
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'Settimana'),
          el('th', { scope: 'col' }, 'Docente'),
          el('th', { scope: 'col' }, 'Ore da aggiungere'))),
        el('tbody', {}, gruppi.map(g => el('tr', {},
          el('td', { class: 'num' }, g.settimana),
          el('th', { scope: 'row' }, g.riga ? nomeRiga(g.riga) : nomeDocente(g.id) + ' (non nel foglio)'),
          el('td', { class: 'num' }, '+' + g.ore)))))),
      el('p', { class: 'hint' }, 'Dopo aver aggiornato il foglio premi "Segna come già riportate": così le ore non vengono contate due volte quando ricarichi il foglio.'));
  }

  function disegnaTutto() {
    if (!D) return;
    if (ui) ui.ridisegna();       // l'altra pagina (es. «Sostituzioni smart») si ridisegna da sola
    if (!contenitore) return;     // la scheda di Orario Facile non c'è
    disegnaDati();
    disegnaGiorno();
    disegnaCoprire();
    // Uscite didattiche (modulo separato, js/uscite.js): il modulo d'inserimento e il piano proposto
    if (conUscite()) {
      if (!$('moduloUscita').hidden) Uscite.disegnaModulo($('moduloUscita'), dataScelta);
      Uscite.disegnaPiano($('pianoUscita'), dataScelta);
    }
    // Scioperi e assemblee sindacali (modulo separato, js/scioperi.js)
    if (typeof Scioperi !== 'undefined') {
      if (!$('moduloSciopero').hidden) Scioperi.disegnaModulo($('moduloSciopero'), dataScelta);
      Scioperi.disegnaPiano($('pianoSciopero'), dataScelta);
    }
    disegnaTutte();
    // Cambi d'aula dello stesso giorno (modulo separato, js/cambi-aula.js)
    if (typeof CambiAula !== 'undefined') CambiAula.disegna($('cambiAula'), dataScelta, 'scheda');
    disegnaSaldi();
    disegnaRiportare();
  }

  // ---------- Esportazioni ----------
  function scaricaCsv(nomeFile, righe) {
    const cella = v => {
      const s = String(v === undefined || v === null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // Il carattere speciale BOM (codice FEFF) all'inizio fa riconoscere a Excel le lettere accentate
    const testo = String.fromCharCode(0xFEFF) + righe.map(r => r.map(cella).join(';')).join('\r\n');
    const link = el('a', { href: URL.createObjectURL(new Blob([testo], { type: 'text/csv;charset=utf-8' })), download: nomeFile });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function scaricaRegistro() {
    if (!registro.length) { avvisa('Il registro è vuoto.'); return; }
    const ordinato = registro.slice().sort((a, b) => a.data.localeCompare(b.data) || a.ora - b.ora);
    scaricaCsv(`sostituzioni-registro-${isoLocale(new Date())}.csv`, [
      ['Data', 'Settimana', 'Ora', 'Classe', 'Aula', 'Materia', 'Docente assente', 'Sostituto', 'Riportata nel foglio'],
      ...ordinato.map(x => [dataBreve(x.data), x.settimana, x.ora, nome('classe', x.classe),
        x.aula ? nome('aula', x.aula) : '', x.materia, nomeDocente(x.assente), nomeDocente(x.sostituto), x.riportata ? 'sì' : 'no'])
    ]);
  }

  function scaricaRiepilogo() {
    const gruppi = riepilogoDaRiportare();
    if (!gruppi.length) { avvisa('Nessuna ora da riportare nel foglio.'); return; }
    scaricaCsv(`sostituzioni-da-riportare-${isoLocale(new Date())}.csv`, [
      ['Settimana', 'COGNOME', 'NOME', 'Ore da aggiungere'],
      ...gruppi.map(g => [g.settimana, g.riga ? g.riga.cognome : nomeDocente(g.id), g.riga ? g.riga.nome : '', g.ore])
    ]);
  }

  function segnaRiportate() {
    const quante = registro.filter(x => !x.riportata).length;
    if (!quante) { avvisa('Non ci sono sostituzioni da segnare.'); return; }
    if (!confirm(`Hai già aggiunto nel foglio queste ${quante} ore di sostituzione? ` +
      'Da ora in poi non verranno più sommate al saldo, perché saranno già nel TOTALE del foglio.')) return;
    registro.forEach(x => { x.riportata = true; });
    salva('registro', registro);
    avvisa(`${quante} sostituzioni segnate come riportate. Ricorda di ricaricare il foglio aggiornato.`);
    disegnaTutto();
  }

  function cancellaTutto() {
    if (!confirm('Cancellare da questo dispositivo il foglio caricato, le assenze, le sostituzioni e gli abbinamenti? Non si può annullare.')) return;
    Archivio.cancellaTutto();
    foglio = null; assenze = []; registro = []; manuali = {};
    aggiornaAbbinamenti();
    disegnaTutto();
    avvisa('Dati cancellati da questo dispositivo.');
  }

  // ---------- Caricamento del foglio scelto dall'utente ----------
  async function caricaFoglio(evento) {
    const file = evento.target.files[0];
    evento.target.value = '';                 // così si può ricaricare lo stesso file
    if (!file) return;
    try {
      foglio = await Foglio.leggiFile(file);
      salva('foglio', foglio);
      aggiornaAbbinamenti();
      disegnaTutto();
      const nonRiportate = registro.filter(x => !x.riportata).length;
      avvisa(`Foglio caricato: ${foglio.docenti.length} docenti.` + (nonRiportate
        ? ` Ci sono ${nonRiportate} sostituzioni non ancora segnate come riportate: se sono già nel foglio, premi "Segna come già riportate".`
        : ''));
    } catch (errore) {
      console.error(errore);
      avvisa('Non riesco a leggere il foglio: ' + errore.message);
    }
  }

  // ---------- La struttura della scheda (disegnata una volta sola) ----------
  const STRUTTURA = `
    <div class="card sost-abilitazione" id="sost-boxAbilitazione" hidden>
      <h3>Abilitazione alle sostituzioni</h3>
      <p id="sost-statoAbilitazione" role="status"></p>
      <p id="sost-avvisoIniziali" class="sost-attenzione" hidden>⚠️ L'orario salvato su questo dispositivo usa ancora le
        <b>iniziali</b> dei docenti ("F. A."), non i codici DOC01…: così non si possono trovare i nomi veri.
        In alto premi <b>«Dati scuola 2026/27»</b> per caricare l'orario aggiornato, poi torna in questa scheda.</p>
      <button type="button" id="sost-verifica" class="btn">🔐 Verifica la mia abilitazione</button>
    </div>

    <div class="card">
      <h3>Foglio del conteggio ore</h3>
      <p id="sost-statoFoglio"></p>
      <div class="row">
        <button type="button" id="sost-caricaDrive" class="btn" hidden>☁️ Carica dal Drive</button>
        <label class="btn sost-scegli-file">Carica il foglio (.ods, .xlsx o .csv)
          <input type="file" id="sost-fileFoglio" accept=".ods,.xlsx,.csv" class="sost-solo-lettori">
        </label>
      </div>
      <p class="hint" style="margin-top:8px">🔒 Il file viene letto <b>solo su questo computer</b>: non viene inviato a nessuno
        e non finisce su GitHub. Per fare una prova:
        <a href="${CARTELLA_ESEMPI}conteggio-ore-esempio.ods" download>facsimile .ods</a> ·
        <a href="${CARTELLA_ESEMPI}conteggio-ore-esempio.xlsx" download>facsimile .xlsx</a> (nomi inventati).</p>
      <p class="hint" id="sost-statoOrario"></p>
      <details id="sost-boxAbbinamenti" class="sost-abbinamenti">
        <summary id="sost-riassuntoAbbinamenti">Abbinamenti tra orario e foglio</summary>
        <div id="sost-abbinamenti"></div>
      </details>
    </div>

    <div class="card">
      <h3>Assenze del giorno</h3>
      <div class="row">
        <button type="button" id="sost-giornoPrima" class="btn ghost" aria-label="Giorno precedente">‹</button>
        <label for="sost-data" class="sost-solo-lettori">Giorno</label>
        <input type="date" id="sost-data" required>
        <button type="button" id="sost-giornoDopo" class="btn ghost" aria-label="Giorno successivo">›</button>
        <button type="button" id="sost-oggi" class="btn ghost">Oggi</button>
      </div>
      <p id="sost-descrizioneGiorno" class="sost-giorno"></p>
      <!-- I casi: 1. assenza di un docente (sostituzione semplice) · 2. uscita didattica (js/uscite.js) -->
      <div class="seg sost-casi" role="group" aria-label="Che cosa succede">
        <button type="button" id="sost-casoAssenza" aria-pressed="true">👤 Assenza di un docente</button>
        <button type="button" id="sost-casoUscita" aria-pressed="false">🚌 Uscita didattica</button>
        <button type="button" id="sost-casoSciopero" aria-pressed="false">✊ Sciopero / assemblea</button>
      </div>
      <div id="sost-moduloUscita" class="sost-modulo" hidden></div>
      <div id="sost-moduloSciopero" class="sost-modulo" hidden></div>
      <form id="sost-moduloAssenza" class="sost-modulo">
        <label class="fl" for="sost-docenteAssente">Docente assente</label>
        <select id="sost-docenteAssente"></select>
        <div id="sost-oreAssenza"></div>
        <!-- Recupero (prima si chiamava «Permesso»; spuntato di default): le ore di assenza vanno a debito del docente
             nel foglio del conteggio. Nei dati il campo resta «permesso», per non perdere le assenze già registrate -->

        <label class="sost-casella sost-permesso">
          <input type="checkbox" id="sost-permesso" checked>
          <span><b>Recupero</b> – le ore di assenza sono a debito: nel foglio del conteggio tolgo 1 per ogni ora
            al docente assente (se la cella è vuota parte da −1)</span>
        </label>
        <button type="submit" class="btn">Registra l'assenza</button>
      </form>
      <div id="sost-elencoAssenze"></div>
    </div>

    <div class="card">
      <h3 id="sost-titoloCoprire">Ore da coprire</h3>
      <p class="hint">Per ogni ora vengono proposti prima i docenti <b>già a scuola</b> quel giorno e liberi in quell'ora,
        dal più <b>alto debito di ore</b> in giù. A parità di debito vengono prima chi ha un'ora buca e chi conosce già la classe.</p>
      <nav id="sost-settimana" class="sost-settimana" aria-label="Giorni della settimana"></nav>
      <div id="sost-pianoUscita"></div>
      <div id="sost-pianoSciopero"></div>
      <div id="sost-oreDaCoprire"></div>
      <div id="sost-stampaGiorno" class="sost-stampabile"></div>
    </div>

    <div class="card">
      <h3>Assenze e sostituzioni di tutti</h3>
      <p class="hint">Tutte le assenze e le sostituzioni pubblicate, anche quelle registrate dai colleghi su altri dispositivi.
        <b>Annulla per tutti</b> su una sostituzione: al docente che sostituiva si toglie 1 ora nel foglio del conteggio,
        la riga sparisce dal foglio «Sostituzioni» e nessuno la vede più nell'app.
        <b>Togli per tutti</b> su un'assenza: si annullano anche le sue sostituzioni (−1 a chi sostituiva), le ore di
        recupero tornano al docente nel foglio del conteggio e l'assenza sparisce per tutti.</p>
      <div class="row"><button type="button" id="sost-caricaTutte" class="btn ghost">👥 Mostra le assenze e le sostituzioni di tutti</button></div>
      <div id="sost-tutte"></div>
    </div>

    <div class="card">
      <h3>Cambi d'aula</h3>
      <p class="hint">Per spostare una classe in un'altra aula <b>solo in questo giorno</b> (l'orario base non cambia).
        Vengono proposte solo le aule libere in tutte le ore scelte.</p>
      <div id="sost-cambiAula"></div>
    </div>

    <div class="card">
      <h3>Saldo ore dei docenti</h3>
      <div id="sost-saldi"></div>
    </div>

    <div class="card">
      <h3>Riportare nel foglio ed esportare</h3>
      <div id="sost-daRiportare"></div>
      <div class="row" style="margin-top:12px">
        <button type="button" id="sost-stampa" class="btn ghost">🖨️ Stampa le sostituzioni del giorno</button>
        <button type="button" id="sost-scaricaRiepilogo" class="btn ghost">Scarica le ore da riportare (CSV)</button>
        <button type="button" id="sost-scaricaRegistro" class="btn ghost">Scarica il registro completo (CSV)</button>
        <button type="button" id="sost-segnaRiportate" class="btn ghost">✔ Segna come già riportate nel foglio</button>
        <button type="button" id="sost-cancellaTutto" class="btn danger">Cancella i dati delle sostituzioni da questo dispositivo</button>
      </div>
    </div>`;

  // Stampa solo la tabella del giorno: durante la stampa il resto della pagina viene nascosto
  function stampa() {
    const conCambi = (typeof CambiAula !== 'undefined' && CambiAula.cambiDel(dataScelta).length) ||
      (conUscite() && Uscite.usciteDel(dataScelta).length);
    if (!oreDaCoprire(dataScelta).length && !conCambi) { avvisa('Nessuna sostituzione né cambio d\'aula da stampare in questo giorno.'); return; }
    document.body.classList.add('sost-in-stampa');
    window.addEventListener('afterprint', () => document.body.classList.remove('sost-in-stampa'), { once: true });
    window.print();
  }

  function collegaPulsanti() {
    $('fileFoglio').addEventListener('change', caricaFoglio);
    $('caricaDrive').addEventListener('click', () => caricaDaDrive(true));
    $('verifica').addEventListener('click', verificaAbilitazione);
    $('data').addEventListener('change', e => { if (e.target.value) { dataScelta = e.target.value; aperte.clear(); disegnaTutto(); } });
    $('giornoPrima').addEventListener('click', () => { dataScelta = spostaGiorni(dataScelta, -1); aperte.clear(); disegnaTutto(); });
    $('giornoDopo').addEventListener('click', () => { dataScelta = spostaGiorni(dataScelta, 1); aperte.clear(); disegnaTutto(); });
    $('oggi').addEventListener('click', () => { dataScelta = giornoPredefinito(); aperte.clear(); disegnaTutto(); });
    $('docenteAssente').addEventListener('change', () => {
      // Docente già assente quel giorno: la casella Permesso riprende la sua scelta; altrimenti spuntata
      const gia = assenzeDel(dataScelta).find(a => a.docente === $('docenteAssente').value);
      $('permesso').checked = gia ? gia.permesso !== false : true;
      disegnaOreAssenza();
    });
    $('moduloAssenza').addEventListener('submit', registraAssenza);
    // i due casi: assenza di un docente oppure uscita didattica (si vede un modulo alla volta)
    // i tre casi: 'assenza' (sostituzione semplice), 'uscita' (uscita didattica), 'sciopero' (sciopero / assemblea)
    const caso = quale => {
      [['Assenza', 'assenza'], ['Uscita', 'uscita'], ['Sciopero', 'sciopero']].forEach(([nome, k]) => {
        $('caso' + nome).setAttribute('aria-pressed', String(quale === k));
        $('modulo' + nome).hidden = quale !== k;
      });
      disegnaTutto();
    };
    $('casoAssenza').addEventListener('click', () => caso('assenza'));
    $('casoUscita').addEventListener('click', () => caso('uscita'));
    $('casoSciopero').addEventListener('click', () => caso('sciopero'));
    if (!conUscite()) $('casoUscita').hidden = true;
    if (typeof Scioperi === 'undefined') $('casoSciopero').hidden = true;
    $('stampa').addEventListener('click', stampa);
    $('scaricaRegistro').addEventListener('click', scaricaRegistro);
    $('scaricaRiepilogo').addEventListener('click', scaricaRiepilogo);
    $('segnaRiportate').addEventListener('click', segnaRiportate);
    $('cancellaTutto').addEventListener('click', cancellaTutto);
    $('caricaTutte').addEventListener('click', caricaTutte);

    // Se i dati delle sostituzioni cambiano in un'altra scheda del browser, ci aggiorniamo
    window.addEventListener('storage', e => {
      if (!Archivio.eNostra(e.key)) return;
      rileggiMemoria();
      aggiorna();
    });
  }

  // Rilegge i dati dalla memoria del browser (sono cambiati altrove: un'altra scheda, oppure assenze e sostituzioni
  // annullate da un altro dispositivo e tolte da PubblicaSostituzioni.applicaAnnullate)
  function rileggiMemoria() {
    foglio = Archivio.leggi('foglio', null);
    assenze = Archivio.leggi('assenze', []);
    registro = Archivio.leggi('registro', []);
    manuali = Archivio.leggi('abbinamenti', {});
  }

  // Rilegge l'orario e ridisegna tutto
  function aggiorna() {
    if (contenitore ? !contenitore.isConnected : !ui) return;
    try {
      D = leggiOrario();
      applicaNomiVeri(D);   // nomi veri al posto dei codici, se sono stati caricati (solo in memoria)
    } catch (errore) {
      console.error(errore);
      if (contenitore) $('statoOrario').textContent = 'Non riesco a leggere l\'orario: ' + errore.message;
      else avvisa('Non riesco a leggere l\'orario: ' + errore.message);
      return;
    }
    aggiornaAbbinamenti();
    disegnaTutto();
    disegnaAbilitazione();
    // Abilitazione: si controlla da sola se il permesso di Google c'è già, altrimenti c'è il pulsante
    if (conRegistro() && abilitazione.stato === 'da-verificare' && RegistroDrive.pronto()) verificaAbilitazione();
    // Foglio del conteggio su Drive: lo rileggiamo da solo, una volta, se il permesso di Google c'è già
    // (per esempio dopo «👁 Nomi»); altrimenti c'è il pulsante «Carica dal Drive»
    if (suDrive() && !driveLetto && FoglioDrive.pronto() && (!foglio || foglio.driveId)) caricaDaDrive(false);
    else sistemaInSospeso();   // correzioni rimaste in sospeso (assenze di qui tolte da un altro dispositivo)
  }

  /*
    Punto d'ingresso, usato da Orario Facile:
    - dove: l'elemento in cui disegnare la scheda
    - funzioneOrario: una funzione che restituisce l'orario (formato di Dati.normalizza)
  */
  function monta(dove, funzioneOrario) {
    leggiOrario = funzioneOrario;
    if (contenitore !== dove) {
      // Prima volta: disegniamo la struttura e colleghiamo i pulsanti
      contenitore = dove;
      contenitore.classList.add('sost');
      contenitore.innerHTML = STRUTTURA;
      document.body.append(el('div', { id: 'sost-avviso', class: 'sost-avviso', role: 'status', 'aria-live': 'polite' }));
      dataScelta = giornoPredefinito();
      collegaPulsanti();
      rileggiMemoria();
      aggiorna();
      // Il riquadro «Abbinamenti tra orario e foglio» resta CHIUSO: se qualcosa manca lo dice il suo titolo
      // («… da controllare»). Prima si apriva da solo, anche quando poi, arrivati i nomi, erano tutti abbinati.
      return;
    }
    aggiorna();
  }

  /*
    Punto d'ingresso per un'altra pagina che vuole usare lo stesso motore con un suo disegno
    (es. «Sostituzioni smart» nell'app Luis@i, app/js/smart.js):
    - funzioneOrario: una funzione che restituisce l'orario (formato di Dati.normalizza)
    - interfaccia: { avvisa(testo), ridisegna() }
    Stesse regole e stessi dati della scheda (memoria del browser con chiavi "sostituzioni."),
    quindi quello che si fa da una parte si vede anche dall'altra. Restituisce le funzioni del motore.
  */
  let collegata = false;
  function collega(funzioneOrario, interfaccia) {
    leggiOrario = funzioneOrario;
    ui = interfaccia;
    if (!collegata) {
      collegata = true;
      // Se i dati cambiano in un'altra scheda del browser (per esempio Orario Facile), ci aggiorniamo
      window.addEventListener('storage', e => {
        if (contenitore || !Archivio.eNostra(e.key)) return;   // con la scheda ci pensa già collegaPulsanti
        rileggiMemoria();
        aggiorna();
      });
      // i file del motore possono essere stati caricati prima: nel frattempo la memoria può essere cambiata
      rileggiMemoria();
    }
    aggiorna();
    return API;
  }

  // Le funzioni del motore che servono all'altra pagina
  const API = {
    aggiorna,
    // stato generale: autorizzazione, foglio del conteggio, orario con le iniziali
    stato: () => ({
      abilitazione: Object.assign({}, abilitazione), puoFare: puoFare(), conRegistro: conRegistro(),
      suDrive: suDrive(), foglio: !!foglio, foglioDaDrive: !!(foglio && foglio.driveId), conIniziali: conIniziali()
    }),
    verifica: verificaAbilitazione,
    caricaDaDrive: () => caricaDaDrive(true),
    orario: () => D,
    nomeDocente, nome, testoOra, giornoOrario, lezioniDi, assenzeDel, giornoPredefinito,
    giorniSettimana, altriGiorniDi, contaGiorno, dataCorta,
    oreDaCoprire, sostituzioneDi, candidati, saldoDi, TESTI_POSIZIONE,
    inCorso: id => inCorso.has(id),
    registraAssenza: registraAssenzaDi, togliAssenza, assegna, annulla, annullaVoce,
    // «Assenze e sostituzioni di tutti»: caricaTutte() legge l'elenco, tutte() lo restituisce ({ elenco, assenze, … }),
    // annullaPerTutti(voce) annulla la sostituzione e pubblica, togliAssenzaPerTutti(voce) toglie l'assenza (chiede conferma)
    caricaTutte, tutte: () => tutte, annullaPerTutti, domandaPerTutti, togliAssenzaPerTutti,
    inCorsoAssenza: a => inCorso.has(a.id) || inCorso.has('A|' + (a.id || segnoAss(a))),
    // servono anche al modulo «Cambi d'aula» (js/cambi-aula.js)
    avvisa, ridisegna: () => disegnaTutto(), email: emailUtente, preparaNomiVeri, nomeVero,
    // servono al modulo «Uscite didattiche» (js/uscite.js)
    registroDel: iso => registro.filter(x => x.data === iso), assentiAllOra, etichettaSaldo, el,
    // mostra un altro giorno nella scheda (per esempio il giorno dopo di una gita di più giorni)
    vaiA: iso => { dataScelta = iso; aperte.clear(); disegnaTutto(); },
    /*
      Toglie le assenze che non hanno lasciato tracce nei fogli (nessuna ora a recupero già tolta, nessuna sostituzione
      collegata): serve a cancellare un'uscita didattica di prova anche senza autorizzazione. Restituisce quante ne ha tolte.
    */
    togliAssenzeSenzaTracce: filtro => {
      const via = assenze.filter(a => filtro(a) && !a.permessoSegnate && !registro.some(x => x.data === a.data && x.assente === a.docente));
      if (!via.length) return 0;
      assenze = assenze.filter(a => !via.includes(a));
      salva('assenze', assenze);
      disegnaTutto();
      return via.length;
    }
  };

  // Le funzioni del motore senza collegare un'altra pagina (le usa il modulo «Cambi d'aula» dentro la scheda)
  const motore = () => API;

  return { monta, collega, motore };
})();

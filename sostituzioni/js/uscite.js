/*
  uscite.js – modulo «Uscita didattica» della scheda Sostituzioni di Orario Facile.

  Il caso: alcune classi sono fuori (gita, visita, uscita sul territorio) con alcuni docenti accompagnatori.
  - Le lezioni delle classi fuori NON vanno coperte (la classe non c'è).
  - Le lezioni degli accompagnatori nelle classi che restano a scuola vanno coperte.
  - I docenti che in quelle ore avevano lezione con le classi fuori sono «liberati»: sono già a scuola e l'ora è già
    loro, quindi coprono gli assenti SENZA ore in più (niente +1 nel foglio del conteggio).

  Il piano proposto (piano()), ora per ora:
  1. per ogni ora da coprire si sceglie un docente liberato in quell'ora, prima chi ha lezione PRIMA E DOPO quell'ora
     (deve restare a scuola comunque); chi invece ha l'ora liberata all'inizio o alla fine della giornata si lascia
     libero, così può entrare dopo o uscire prima;
  2. se non c'è un docente liberato, si propone il primo docente libero delle proposte normali (+1 nel conteggio);
  3. le ore liberate che restano:
     - all'inizio o alla fine della giornata del docente → «entra dopo» / «esce prima», ore A RECUPERO
       (−1 per ogni ora nel foglio del conteggio, come un'assenza con «Recupero»);
     - in mezzo ad altre lezioni (non può né entrare dopo né uscire prima) → «a disposizione», NON a recupero;
     - almeno 1 ora il docente la fa sempre: se tutte le sue ore di quel giorno sono liberate, la prima resta
       «a disposizione».
  «Applica il piano» assegna le sostituzioni e registra le ore a recupero; tutto si può ancora cambiare a mano.

  Dati: chiave "sostituzioni.uscite" (archivio.js): [{ id, data, nome, classi: [id], ore: [n], accompagnatori: [id],
  disposizione: [{ docente, ore }] }]. La descrizione (nome) resta su questo dispositivo; si pubblicano solo
  data, classi, ore (app/js/pubblica-sostituzioni.js), così nell'app le classi fuori si vedono «🚌 In uscita».
  Gli accompagnatori diventano assenze (senza recupero) con uscita = ID e come = 'accompagna';
  le ore a recupero diventano assenze con recupero, uscita = ID e come = 'recupero'.
  Le regole e i dati dell'orario arrivano dal motore delle sostituzioni (Sostituzioni.motore()).
*/
const Uscite = (() => {
  let uscite = Archivio.leggi('uscite', []);
  const m = () => Sostituzioni.motore();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nuovoId = () => 'us' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const salva = () => { if (!Archivio.scrivi('uscite', uscite)) m().avvisa('Attenzione: non riesco a salvare le uscite didattiche su questo dispositivo.'); };
  const oreTesto = elenco => elenco.map(n => n + 'ª').join(', ');
  const numerico = (a, b) => String(a).localeCompare(String(b), 'it', { numeric: true });

  // Il modulo: le scelte restano anche quando la pagina si ridisegna
  const scelta = { data: '', nome: '', fino: '', classi: new Set(), ore: null, accompagnatori: new Set() };
  // "2026-09-28" + 1 giorno -> "2026-09-29" (a mezzogiorno, così l'ora legale non sposta la data)
  const spostaIso = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const dataCorta = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric' });
  // i giorni della stessa uscita di più giorni (gruppo), in ordine; per un'uscita di un giorno solo [u.data]
  const giorniDi = u => u.gruppo ? [...new Set(uscite.filter(x => x.gruppo === u.gruppo).map(x => x.data))].sort() : [u.data];
  // tutti i giorni delle uscite di un giorno (anche gli altri giorni delle gite di più giorni)
  const giorniCollegati = iso => [...new Set(usciteDel(iso).flatMap(giorniDi))].sort();
  // Nel piano: docente scelto a mano per un'ora (chiave "data|ora|classe|assente" -> ID docente)
  const forzate = new Map();
  let inCorso = false;

  // ---------- Regole ----------
  const usciteDel = iso => uscite.filter(u => u.data === iso);
  // Un'uscita è una SIMULAZIONE finché non si preme «✔ Conferma il piano» (le uscite di prima valgono come confermate)
  const confermata = u => u.confermata !== false;
  const classeFuori = (iso, classe, ora) => uscite.some(u => u.data === iso && u.classi.includes(classe) && u.ore.includes(ora));
  const accompagna = (iso, docente, ora) => uscite.some(u => u.data === iso && u.accompagnatori.includes(docente) && u.ore.includes(ora));
  const lezioniOra = (giorno, docente, ora) => m().orario().lezioni.filter(l => l.giorno === giorno && l.docente === docente && l.ora === ora);

  // Vero se il docente a quell'ora è «liberato»: aveva lezione solo con classi fuori, non accompagna e non è assente
  function liberato(iso, docente, ora) {
    const mo = m(); if (!mo.orario()) return false;
    const giorno = mo.giornoOrario(iso); if (!giorno || !usciteDel(iso).length) return false;
    const lez = lezioniOra(giorno, docente, ora);
    return lez.length > 0 && lez.every(l => classeFuori(iso, l.classe, ora)) &&
      !accompagna(iso, docente, ora) && !mo.assentiAllOra(iso, ora).has(docente);
  }

  /*
    Il piano del giorno: { coperture: [{ l, docente, tipo, alternative }], disposizione: [{ docente, ore, perche }],
    recuperi: [{ docente, prima: [ore], dopo: [ore], entra, esce }] } (null se quel giorno non ci sono uscite).
    tipo: 'liberato' (nessuna ora in più) | 'normale' (+1 nel conteggio) | '' (nessuno disponibile).
  */
  function piano(iso) {
    const mo = m(), D = mo.orario();
    if (!D || !usciteDel(iso).length) return null;
    const giorno = mo.giornoOrario(iso); if (!giorno) return null;
    const registro = mo.registroDel(iso);
    const daCoprire = mo.oreDaCoprire(iso).filter(l => !mo.sostituzioneDi(iso, l));
    // Simulazione (uscita non ancora confermata): gli accompagnatori non sono ancora registrati assenti,
    // quindi le loro lezioni nelle classi che restano a scuola le aggiungiamo qui
    usciteDel(iso).filter(u => !confermata(u)).forEach(u => u.accompagnatori.forEach(a => {
      if (!D.mappa.docente.has(a)) return;
      mo.lezioniDi(a, giorno).filter(l => u.ore.includes(l.ora) && !classeFuori(iso, l.classe, l.ora) &&
        !mo.assentiAllOra(iso, l.ora).has(a) && !daCoprire.some(k => k.ora === l.ora && k.classe === l.classe && k.assente === a))
        .forEach(l => daCoprire.push(Object.assign({ assente: a }, l)));
    }));
    daCoprire.sort((a, b) => a.ora - b.ora || numerico(a.classe, b.classe));

    // Per ogni docente: F = ore liberate, R = ore in cui deve essere a scuola (lezioni con classi presenti + sostituzioni)
    const info = new Map();
    D.docente.forEach(t => {
      const lez = mo.lezioniDi(t.id, giorno);
      const F = new Set(), R = new Set();
      [...new Set(lez.map(l => l.ora))].forEach(h => {
        if (liberato(iso, t.id, h)) F.add(h);
        else if (!mo.assentiAllOra(iso, h).has(t.id) && !accompagna(iso, t.id, h) && lez.some(l => l.ora === h && !classeFuori(iso, l.classe, h))) R.add(h);
      });
      registro.filter(s => s.sostituto === t.id).forEach(s => { R.add(s.ora); F.delete(s.ora); });
      if (F.size) info.set(t.id, { F, R, usate: new Set() });
    });
    const liberi = (h, tranne) => [...info].filter(([id, x]) => x.F.has(h) && (!x.usate.has(h) || id === tranne)).map(([id]) => id);
    // Punteggio (più basso = da impiegare prima): 0 = ha lezione prima e dopo; 1 = non ha altre ore (almeno 1 la deve
    // fare); 2 + distanza = ora all'inizio o alla fine della sua giornata (meglio lasciarlo libero)
    function punteggio(id, h) {
      const R = [...info.get(id).R];
      if (!R.length) return 1;
      if (Math.min(...R) < h && h < Math.max(...R)) return 0;
      return 2 + Math.min(...R.map(r => Math.abs(r - h)));
    }
    const conosce = (id, classe) => D.lezioni.some(k => k.docente === id && k.classe === classe);
    const usatoNelPiano = new Set();   // "docente|ora" già scelti nel piano (anche docenti non liberati)

    const coperture = daCoprire.map(l => {
      const chiave = [iso, l.ora, l.classe, l.assente].join('|');
      let docente = '', tipo = '';
      const forzato = forzate.get(chiave);
      if (forzato === '__nessuno') { /* scelto «— nessuno —»: si lascia da coprire */ }
      else if (forzato && !usatoNelPiano.has(forzato + '|' + l.ora)) {
        docente = forzato;
        tipo = info.has(forzato) && info.get(forzato).F.has(l.ora) && !info.get(forzato).usate.has(l.ora) ? 'liberato' : 'normale';
      } else {
        const lib = liberi(l.ora).sort((a, b) => punteggio(a, l.ora) - punteggio(b, l.ora) ||
          conosce(b, l.classe) - conosce(a, l.classe) || mo.nomeDocente(a).localeCompare(mo.nomeDocente(b), 'it'));
        if (lib.length) { docente = lib[0]; tipo = 'liberato'; }
        else {
          // (non i docenti «spostabili» da una compresenza: il piano dell'uscita usa solo liberati e liberi)
          const altro = mo.candidati(iso, l).find(c => !c.liberato && !c.spostato && !usatoNelPiano.has(c.t.id + '|' + l.ora));
          if (altro) { docente = altro.t.id; tipo = 'normale'; }
        }
      }
      if (docente) {
        usatoNelPiano.add(docente + '|' + l.ora);
        if (tipo === 'liberato') { info.get(docente).usate.add(l.ora); info.get(docente).R.add(l.ora); }
      }
      return { l, chiave, docente, tipo };
    });
    // le alternative di ogni ora (per la tendina): i liberati di quell'ora e i primi docenti liberi
    coperture.forEach(c => {
      const lib = liberi(c.l.ora, c.docente).map(id => ({ id, liberato: true }));
      const altri = mo.candidati(iso, c.l).filter(k => !k.liberato && !k.spostato && (!usatoNelPiano.has(k.t.id + '|' + c.l.ora) || k.t.id === c.docente))
        .slice(0, 5).map(k => ({ id: k.t.id, liberato: false }));
      c.alternative = lib.concat(altri.filter(a => !lib.some(x => x.id === a.id)));
      if (c.docente && !c.alternative.some(a => a.id === c.docente)) c.alternative.unshift({ id: c.docente, liberato: c.tipo === 'liberato' });
    });

    // Le ore liberate rimaste: a disposizione (in mezzo) o a recupero (all'inizio o alla fine)
    const disposizione = [], recuperi = [];
    info.forEach((x, id) => {
      const restanti = [...x.F].filter(h => !x.usate.has(h)).sort((a, b) => a - b);
      if (!restanti.length) return;
      const disp = [], prima = [], dopo = [];
      let perche = 'ha lezione prima e dopo';
      if (!x.R.size) { disp.push(restanti.shift()); x.R.add(disp[0]); perche = 'almeno 1 ora a scuola'; }
      const minR = Math.min(...x.R), maxR = Math.max(...x.R);
      restanti.forEach(h => { if (h < minR) prima.push(h); else if (h > maxR) dopo.push(h); else disp.push(h); });
      if (disp.length) disposizione.push({ docente: id, ore: disp.sort((a, b) => a - b), perche });
      if (prima.length || dopo.length) recuperi.push({ docente: id, prima, dopo, entra: minR, esce: maxR });
    });
    const perNome = (a, b) => mo.nomeDocente(a.docente).localeCompare(mo.nomeDocente(b.docente), 'it');
    return { coperture, disposizione: disposizione.sort(perNome), recuperi: recuperi.sort(perNome) };
  }

  // ---------- Azioni ----------
  function permesso() {
    if (m().stato().puoFare) return true;
    m().avvisa('Solo chi è nel foglio «Autorizzazioni» può registrare le uscite didattiche: prima verifica la tua autorizzazione.');
    return false;
  }
  // ore di un'assenza già registrata + quelle nuove, senza doppioni
  function unisciOre(iso, docente, nuove) {
    const gia = m().assenzeDel(iso).find(a => a.docente === docente);
    return [...new Set((gia ? gia.ore : []).concat(nuove))].sort((a, b) => a - b);
  }

  /*
    «Registra l'uscita» crea solo una SIMULAZIONE: niente assenze, niente fogli, nessuna autorizzazione richiesta.
    Il piano si vede subito in «Ore da coprire»; si registra davvero con «✔ Conferma il piano» (conferma()).
  */
  function registra(iso) {
    const mo = m(), giorno = mo.giornoOrario(iso);
    const classi = [...scelta.classi], ore = [...(scelta.ore || oreDelGiorno(giorno))].sort((a, b) => a - b);
    if (!classi.length) { mo.avvisa('Scegli almeno una classe che esce.'); return; }
    if (!ore.length) { mo.avvisa('Scegli almeno un\'ora dell\'uscita.'); return; }
    // Più giorni consecutivi (gita): un'uscita per ogni giorno DI SCUOLA da «iso» a «fino al giorno», legate da «gruppo».
    // Se tutte le ore erano spuntate, ogni giorno prende tutte le sue ore; altrimenti le stesse ore scelte.
    const giorni = [iso];
    if (scelta.fino && scelta.fino > iso) {
      for (let d = spostaIso(iso, 1); d <= scelta.fino && giorni.length < 15; d = spostaIso(d, 1)) if (mo.giornoOrario(d)) giorni.push(d);
    }
    const gruppo = giorni.length > 1 ? nuovoId() : '';
    const acc = [...scelta.accompagnatori];
    giorni.forEach(d => {
      const oreGiorno = scelta.ore ? ore : oreDelGiorno(mo.giornoOrario(d));
      const u = { id: nuovoId(), data: d, nome: scelta.nome.trim(), classi, ore: oreGiorno, accompagnatori: acc.slice(), disposizione: [], confermata: false };
      if (gruppo) u.gruppo = gruppo;
      uscite.push(u);
    });
    salva();
    scelta.nome = ''; scelta.fino = ''; scelta.classi.clear(); scelta.ore = null; scelta.accompagnatori.clear();
    mo.avvisa(`🧪 Simulazione dell'uscita${giorni.length > 1 ? ` di ${giorni.length} giorni di scuola` : ''}: ${classi.length} ${classi.length === 1 ? 'classe' : 'classi'}, ${acc.length} ` +
      `${acc.length === 1 ? 'accompagnatore' : 'accompagnatori'}. Guarda il piano in «Ore da coprire»: niente è registrato finché non premi «✔ Conferma il piano».`);
    mo.ridisegna();
    const p = document.getElementById('sost-pianoUscita'); if (p) p.scrollIntoView({ behavior: 'smooth' });
  }

  // «✔ Conferma il piano»: registra gli accompagnatori assenti, le sostituzioni, le ore a recupero e chi è a disposizione
  async function applica(iso) {
    if (!permesso() || inCorso) return;
    const mo = m(), giorno = mo.giornoOrario(iso);
    if (!piano(iso)) return;
    inCorso = true; mo.ridisegna();
    let sost = 0, rec = 0;
    try {
      // 0. gli accompagnatori diventano assenti nelle loro ore di lezione durante l'uscita (senza recupero: lavorano)
      usciteDel(iso).filter(u => !confermata(u)).forEach(u => {
        u.accompagnatori.forEach(id => {
          const sue = [...new Set(mo.lezioniDi(id, giorno).map(l => l.ora))].filter(h => u.ore.includes(h));
          if (sue.length) mo.registraAssenza(iso, id, unisciOre(iso, id, sue), false, [], { uscita: u.id, come: 'accompagna', silenzioso: true });
        });
        u.confermata = true;
      });
      salva();
      // il piano ricalcolato adesso che gli accompagnatori sono registrati (le scelte fatte con la tendina restano)
      const p = piano(iso), u = usciteDel(iso)[0];
      // 1. le sostituzioni, una alla volta (il foglio del conteggio si aggiorna in fila)
      for (const c of p.coperture.filter(x => x.docente)) {
        await mo.assegna(iso, c.l, c.docente, { reindirizzato: c.tipo === 'liberato', uscita: u.id, silenzioso: true });
        sost++;
      }
      // 2. le ore a recupero di chi entra dopo o esce prima (−1 per ogni ora nel foglio del conteggio)
      p.recuperi.forEach(r => {
        const ore = r.prima.concat(r.dopo);
        mo.registraAssenza(iso, r.docente, unisciOre(iso, r.docente, ore), true, [], { uscita: u.id, come: 'recupero', silenzioso: true });
        rec += ore.length;
      });
      // 3. chi resta a disposizione (per la stampa e per l'app)
      u.disposizione = p.disposizione.map(d => ({ docente: d.docente, ore: d.ore }));
      salva();
      forzate.clear();
      mo.avvisa(`✔ Piano confermato: ${sost} ${sost === 1 ? 'sostituzione' : 'sostituzioni'}, ${rec} ${rec === 1 ? 'ora' : 'ore'} a recupero, ` +
        `${p.disposizione.length} ${p.disposizione.length === 1 ? 'docente' : 'docenti'} a disposizione.`);
    } finally { inCorso = false; mo.ridisegna(); }
  }

  /*
    Toglie un'uscita. Se è ancora una simulazione si cancella e basta (nessuna autorizzazione: non era scritto niente).
    Se era confermata servono l'autorizzazione e si tolgono anche sostituzioni, assenze e recuperi collegati.
    giaChiesto: true quando la conferma l'ha già chiesta azzera()
  */
  async function togli(id, giaChiesto) {
    const u = uscite.find(x => x.id === id); if (!u) return;
    if (!confermata(u)) {
      if (!giaChiesto && !confirm('Cancellare questa simulazione di uscita didattica?')) return;
      uscite = uscite.filter(x => x.id !== u.id); salva(); forzate.clear();
      m().avvisa('Simulazione cancellata.'); m().ridisegna();
      return;
    }
    // Confermata ma senza tracce nei fogli (nessuna sostituzione, nessuna ora a recupero già tolta): si toglie senza autorizzazione
    const mo0 = m();
    const tracce = mo0.registroDel(u.data).some(s => s.uscita === u.id || s.reindirizzato ||
        mo0.assenzeDel(u.data).some(a => a.uscita === u.id && a.docente === s.assente)) ||
      mo0.assenzeDel(u.data).some(a => a.uscita === u.id && a.permessoSegnate);
    if (!tracce && !mo0.stato().puoFare) {
      if (!giaChiesto && !confirm('Togliere l\'uscita didattica? Non ha ancora scritto niente nei fogli: si toglie solo da questo dispositivo.')) return;
      mo0.togliAssenzeSenzaTracce(a => a.uscita === u.id);
      uscite = uscite.filter(x => x.id !== u.id); salva(); forzate.clear();
      mo0.avvisa('Uscita didattica tolta.'); mo0.ridisegna();
      return;
    }
    if (!permesso()) return;
    if (!giaChiesto && !confirm('Togliere l\'uscita didattica già confermata? Vengono tolte anche le sostituzioni del piano, le assenze degli accompagnatori e le ore a recupero collegate.')) return;
    const mo = m(), iso = u.data;
    const assenzeU = mo.assenzeDel(iso).filter(a => a.uscita === u.id);
    const unica = usciteDel(iso).length === 1;
    const collegate = mo.registroDel(iso).filter(s => s.uscita === u.id || (unica && s.reindirizzato) || assenzeU.some(a => a.docente === s.assente));
    for (const s of collegate) await mo.annulla(s);
    for (const a of assenzeU) await mo.togliAssenza(a, true);
    uscite = uscite.filter(x => x.id !== u.id); salva();
    mo.avvisa('Uscita didattica tolta.');
    mo.ridisegna();
  }

  // «↺ Azzera»: toglie tutte le uscite del giorno (una sola domanda)
  async function azzera(iso) {
    const qui = usciteDel(iso); if (!qui.length) return;
    const conf = qui.filter(confermata).length;
    if (!confirm(conf ? `Togliere tutte le uscite di questo giorno? ${conf === 1 ? 'Una è già confermata' : conf + ' sono già confermate'}: ` +
      'vengono tolte anche le sostituzioni, le assenze e i recuperi collegati.' : 'Cancellare la simulazione delle uscite di questo giorno?')) return;
    for (const u of qui) await togli(u.id, true);
  }

  /*
    «🗑 Cancella tutte le uscite didattiche»: tutte le uscite di tutti i giorni e quello che avevano creato
    (assenze degli accompagnatori, ore a recupero, sostituzioni dei docenti liberati), anche se è rimasto «orfano».
    Quello che non ha scritto niente nei fogli si toglie sempre; il resto solo con l'autorizzazione verificata.
  */
  async function azzeraTutto() {
    const mo = m();
    if (!confirm('Cancellare TUTTE le uscite didattiche e tutte le modifiche che hanno fatto (assenze degli accompagnatori, ore a recupero, sostituzioni dei docenti liberati)?')) return;
    for (const u of uscite.slice()) await togli(u.id, true);
    // avanzi: assenze e sostituzioni con il segno di un'uscita che non c'è più
    const date = new Set(Archivio.leggi('assenze', []).filter(a => a.uscita).map(a => a.data)
      .concat(Archivio.leggi('registro', []).filter(s => s.uscita || s.reindirizzato).map(s => s.data)));
    let restano = 0;
    for (const iso of date) {
      if (mo.stato().puoFare) {
        for (const s of mo.registroDel(iso).filter(s => s.uscita || s.reindirizzato)) await mo.annulla(s);
        for (const a of mo.assenzeDel(iso).filter(a => a.uscita)) await mo.togliAssenza(a, true);
      } else {
        mo.togliAssenzeSenzaTracce(a => a.data === iso && !!a.uscita);
        restano += mo.assenzeDel(iso).filter(a => a.uscita).length + mo.registroDel(iso).filter(s => s.uscita || s.reindirizzato).length;
      }
    }
    mo.avvisa(uscite.length || restano
      ? '⚠️ Alcune modifiche hanno già scritto nei fogli (sostituzioni o ore a recupero): per toglierle verifica prima la tua autorizzazione, poi ripremi il tasto.'
      : '✔ Tutte le uscite didattiche e le loro modifiche sono state cancellate.');
    mo.ridisegna();
  }

  // ---------- Disegno ----------
  const oreDelGiorno = giorno => [...new Set(m().orario().lezioni.filter(l => l.giorno === giorno).map(l => l.ora))].sort((a, b) => a - b);
  const legati = new WeakSet();

  function disegnaModulo(box, iso) {
    const mo = m(), D = mo.orario();
    if (!D) return;
    if (!legati.has(box)) { legati.add(box); box.addEventListener('click', clic); box.addEventListener('change', cambio); box.addEventListener('input', cambio); }
    if (scelta.data !== iso) { scelta.data = iso; scelta.fino = ''; scelta.classi.clear(); scelta.ore = null; scelta.accompagnatori.clear(); }
    const giorno = mo.giornoOrario(iso);
    if (!giorno) { box.innerHTML = '<p class="hint">In questo giorno non c\'è lezione.</p>'; return; }
    const ore = oreDelGiorno(giorno), oreScelte = scelta.ore || new Set(ore);
    const classi = D.classe.slice().sort((a, b) => numerico(a.nome, b.nome));
    // prima i docenti che insegnano nelle classi scelte (sono i più probabili accompagnatori)
    const nelleClassi = new Set(D.lezioni.filter(l => scelta.classi.has(l.classe)).map(l => l.docente));
    const docenti = D.docente.slice().sort((a, b) => (nelleClassi.has(b.id) - nelleClassi.has(a.id)) || mo.nomeDocente(a.id).localeCompare(mo.nomeDocente(b.id), 'it'));
    const casella = (tipo, valore, testo, spuntata) =>
      `<label class="sost-casella"><input type="checkbox" data-us="${tipo}" value="${esc(valore)}"${spuntata ? ' checked' : ''}> ${esc(testo)}</label>`;
    const casellaDoc = t => {
      const oreQui = D.lezioni.filter(l => l.giorno === giorno && l.docente === t.id && oreScelte.has(l.ora));
      const inClassi = oreQui.filter(l => scelta.classi.has(l.classe)).length;
      return casella('acc', t.id, mo.nomeDocente(t.id) + (inClassi ? ` · ${inClassi} ${inClassi === 1 ? 'ora' : 'ore'} nelle classi che escono` :
        oreQui.length ? ` · ${oreQui.length} ${oreQui.length === 1 ? 'ora' : 'ore'} da coprire` : ' · nessuna lezione in quelle ore'), scelta.accompagnatori.has(t.id));
    };
    const giaQui = usciteDel(iso);
    box.innerHTML =
      (giaQui.length ? `<h4>Uscite di questo giorno</h4><ul class="sost-assenze">${giaQui.map(u => `<li><span><strong>${confermata(u) ? '🚌' : '🧪 simulazione ·'} ${esc(u.nome || 'Uscita didattica')}</strong>` +
        (giorniDi(u).length > 1 ? ` (giorno ${giorniDi(u).indexOf(u.data) + 1} di ${giorniDi(u).length}, fino a ${esc(dataCorta(giorniDi(u).slice(-1)[0]))})` : '') + ' – ' +
        `${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))} · ${oreTesto(u.ore)} ora` +
        (u.accompagnatori.length ? ` · accompagnano: ${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}` : '') +
        `</span><button type="button" class="btn ghost sm" data-us="togli" data-id="${esc(u.id)}">Togli</button></li>`).join('')}</ul>` : '') +
      `<p class="hint">Scegli le classi che escono, le ore e i docenti che accompagnano: il programma propone chi copre gli
        accompagnatori (prima i docenti rimasti senza classe), chi può entrare dopo o uscire prima (a recupero) e chi resta a disposizione.</p>
      <label class="fl">Descrizione (facoltativa, resta su questo dispositivo)
        <input type="text" data-us="nome" value="${esc(scelta.nome)}" maxlength="80" placeholder="es. Museo, teatro, uscita sul territorio"></label>
      <label class="fl">Più giorni consecutivi? Fino al giorno (compreso; vuoto = solo oggi)
        <input type="date" data-us="fino" value="${esc(scelta.fino)}" min="${esc(spostaIso(iso, 1))}" max="${esc(spostaIso(iso, 20))}"></label>
      <fieldset class="sost-ore"><legend>Classi che escono</legend>${classi.map(c => casella('classe', c.id, c.nome, scelta.classi.has(c.id))).join('')}</fieldset>
      <fieldset class="sost-ore"><legend>Ore dell'uscita</legend>${ore.map(h => casella('ora', h, mo.testoOra(h), oreScelte.has(h))).join('')}</fieldset>
      <fieldset class="sost-ore"><legend>Docenti che accompagnano</legend>
        ${nelleClassi.size ? docenti.filter(t => nelleClassi.has(t.id)).map(casellaDoc).join('') : '<p class="hint">Scegli prima le classi: qui compaiono i loro docenti.</p>'}
        <details${docenti.some(t => !nelleClassi.has(t.id) && scelta.accompagnatori.has(t.id)) ? ' open' : ''}><summary>Altri docenti</summary>
          ${docenti.filter(t => !nelleClassi.has(t.id)).map(casellaDoc).join('')}</details>
      </fieldset>
      <button type="button" class="btn" data-us="registra">🧪 Simula l'uscita e proponi il piano</button>
      <p class="hint">È solo una prova: si registra davvero con «✔ Conferma il piano» (in «Ore da coprire»).</p>` +
      // il tasto per cancellare tutto quello che hanno fatto le uscite (di tutti i giorni), se c'è qualcosa
      (uscite.length || Archivio.leggi('assenze', []).some(a => a.uscita) || Archivio.leggi('registro', []).some(s => s.uscita || s.reindirizzato)
        ? `<div class="row" style="margin-top:10px"><button type="button" class="btn danger" data-us="azzeraTutto">🗑 Cancella tutte le uscite didattiche</button>
          <span class="hint">${uscite.length} ${uscite.length === 1 ? 'uscita' : 'uscite'} in tutto, con le loro assenze, sostituzioni e ore a recupero.</span></div>` : '');
  }

  function disegnaPiano(box, iso) {
    if (!box) return;
    if (!legati.has(box)) { legati.add(box); box.addEventListener('click', clic); box.addEventListener('change', cambio); }
    const p = piano(iso);
    if (!p) { box.innerHTML = ''; return; }
    const mo = m(), qui = usciteDel(iso);
    const nome = id => esc(mo.nomeDocente(id));
    // chi è già stato messo a recupero dall'uscita (piano già applicato)
    const giaRecupero = mo.assenzeDel(iso).filter(a => a.come === 'recupero');
    const simulazione = qui.some(u => !confermata(u));
    const giorni = giorniCollegati(iso);   // più di uno = gita di più giorni
    const inAttesa = simulazione || p.coperture.some(c => c.docente) || p.recuperi.length;
    const riga = c => {
      const nota = c.tipo === 'liberato' ? '🚌 liberato dall\'uscita: nessuna ora in più'
        : c.tipo === 'normale' ? '+1 nel conteggio (nessun docente liberato libero in quest\'ora)' : '⚠ nessun docente disponibile: vedi sotto';
      return `<tr><th scope="row">${esc(mo.testoOra(c.l.ora))}</th><td>${esc(mo.nome('classe', c.l.classe))}</td><td>${nome(c.l.assente)}</td>
        <td><label class="sost-solo-lettori" for="us-${esc(c.chiave)}">Chi copre</label>
        <select id="us-${esc(c.chiave)}" data-us="scegli" data-chiave="${esc(c.chiave)}"><option value="">— nessuno —</option>${c.alternative.map(a =>
          `<option value="${esc(a.id)}"${a.id === c.docente ? ' selected' : ''}>${a.liberato ? '🚌 ' : ''}${nome(a.id)}</option>`).join('')}</select></td>
        <td class="${c.tipo === 'liberato' ? '' : 'sost-attenzione'}">${nota}</td></tr>`;
    };
    const oraDi = h => h + 'ª';
    box.innerHTML = `<article class="sost-ora sost-piano-uscita">
      <h3>🚌 Uscita didattica: piano proposto</h3>
      <p class="${simulazione ? 'sost-attenzione' : 'hint'}" role="status">${simulazione
        ? '🧪 <b>Simulazione</b>: niente è ancora registrato. Controlla il piano, poi premi «✔ Conferma il piano» oppure «↺ Azzera la simulazione».'
        : '✔ Uscita confermata: sostituzioni, assenze e recuperi sono registrati.'}</p>
      ${giorni.length > 1 ? `<nav class="sost-settimana" aria-label="Giorni dell'uscita">
        <span class="hint">🗓 Uscita di ${giorni.length} giorni:</span>
        ${giorni.map(d => `<button type="button" class="btn sm${d === iso ? '' : ' ghost'}" data-us="vai" data-data="${esc(d)}"${d === iso ? ' aria-current="date"' : ''}>` +
          `${esc(dataCorta(d))}${usciteDel(d).some(u => !confermata(u)) ? ' · 🧪' : ' · ✔'}</button>`).join('')}</nav>
        <div class="row">
          <button type="button" class="btn" data-us="confermaGiorni" data-giorni="${esc(giorni.join(','))}"${inCorso ? ' disabled' : ''}>✔ Conferma tutti i giorni</button>
          <button type="button" class="btn" data-us="stampaGiorni" data-giorni="${esc(giorni.join(','))}">🖨️ Stampa tutti i giorni</button>
          <button type="button" class="btn danger" data-us="azzeraGiorni" data-giorni="${esc(giorni.join(','))}"${inCorso ? ' disabled' : ''}>↺ Azzera tutti i giorni</button>
        </div>
        <p class="hint">Qui sotto il piano di ${esc(dataCorta(iso))}: tocca un giorno per vedere il suo.</p>` : ''}
      <p class="sost-dettagli">${qui.map(u => `${confermata(u) ? '' : '🧪 '}${esc(u.nome || 'Uscita')}: ${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))} fuori (${oreTesto(u.ore)} ora)` +
        (u.accompagnatori.length ? ` · accompagnano ${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}` : '')).join(' · ')}</p>
      ${p.coperture.length ? `<div class="tablewrap"><table class="sost-tabella"><caption>Ore da coprire e proposta</caption>
        <thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Assente</th><th scope="col">Copre</th><th scope="col">Note</th></tr></thead>
        <tbody>${p.coperture.map(riga).join('')}</tbody></table></div>` : '<p class="hint">✔ Nessuna ora ancora da coprire.</p>'}
      ${p.recuperi.length ? `<h4>Entrano dopo o escono prima (ore a recupero: −1 per ogni ora nel conteggio)</h4><ul>${p.recuperi.map(r =>
        `<li><strong>${nome(r.docente)}</strong>: ${[r.prima.length ? `entra alla ${oraDi(r.entra)} ora (${oreTesto(r.prima)} a recupero)` : '',
          r.dopo.length ? `esce dopo la ${oraDi(r.esce)} ora (${oreTesto(r.dopo)} a recupero)` : ''].filter(Boolean).join(' e ')}</li>`).join('')}</ul>` : ''}
      ${giaRecupero.length ? `<h4>Già registrati a recupero</h4><ul>${giaRecupero.map(a => `<li><strong>${nome(a.docente)}</strong>: ${oreTesto(a.ore)} ora</li>`).join('')}</ul>` : ''}
      ${p.disposizione.length ? `<h4>A disposizione (restano a scuola, nessun recupero)</h4><ul>${p.disposizione.map(d =>
        `<li><strong>${nome(d.docente)}</strong>: ${oreTesto(d.ore)} ora · ${esc(d.perche)}</li>`).join('')}</ul>` : ''}
      <div class="row">${inAttesa ? `<button type="button" class="btn" data-us="applica" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>${inCorso ? 'Registro…' : simulazione ? '✔ Conferma il piano' : '✔ Conferma le modifiche'}</button>`
        : '<span class="tag ok">✔ Piano confermato</span>'}
        <button type="button" class="btn" data-us="stampa" data-data="${esc(iso)}">🖨️ Stampa il piano</button>
        <button type="button" class="btn danger" data-us="azzera" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>${simulazione && !qui.some(confermata) ? '↺ Azzera la simulazione' : '↺ Togli le uscite del giorno'}</button>
        ${p.coperture.length ? '<span class="hint">Si può cambiare chi copre con la tendina (🚌 = liberato dall\'uscita) o assegnare le ore una per una qui sotto.</span>' : ''}</div>
    </article>`;
  }

  // Tabella per la stampa del giorno (vuota se non ci sono uscite)
  function tabellaStampa(iso) {
    const p = piano(iso); if (!p) return '';
    const mo = m(), nome = id => esc(mo.nomeDocente(id));
    const giaRecupero = mo.assenzeDel(iso).filter(a => a.come === 'recupero');
    const righe = usciteDel(iso).map(u => `<tr><th scope="row">${esc(u.nome || 'Uscita didattica')}</th><td>${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))}</td>
      <td>${oreTesto(u.ore)}</td><td>${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}</td></tr>`).join('');
    const disp = p.disposizione.map(d => `${nome(d.docente)} (${oreTesto(d.ore)})`).join(', ');
    const rec = giaRecupero.map(a => `${nome(a.docente)} (${oreTesto(a.ore)})`).join(', ');
    return `<table class="sost-tabella"><caption>Uscite didattiche</caption>
      <thead><tr><th scope="col">Uscita</th><th scope="col">Classi fuori</th><th scope="col">Ore</th><th scope="col">Accompagnatori</th></tr></thead>
      <tbody>${righe}${disp ? `<tr><th scope="row">A disposizione</th><td colspan="3">${disp}</td></tr>` : ''}${rec ? `<tr><th scope="row">Entrano dopo / escono prima</th><td colspan="3">${rec}</td></tr>` : ''}</tbody></table>`;
  }

  /*
    «🖨️ Stampa il piano»: una pagina con tutto il piano del giorno (anche se è ancora una simulazione):
    uscite, chi copre ogni ora, chi entra dopo o esce prima (a recupero), chi resta a disposizione.
    Si prepara un riquadro a parte (.sost-stampabile.us-piano-stampa) e durante la stampa si vede solo quello.
  */
  // giorni: un giorno ("2026-09-28") o più giorni (gita): una pagina per giorno
  function stampaPiano(giorni) {
    const html = [].concat(giorni).map(pianoStampaHtml).filter(Boolean);
    if (!html.length) return;
    const box = document.createElement('div');
    box.className = 'sost-stampabile us-piano-stampa';
    box.innerHTML = html.join('<div class="us-salto-pagina"></div>');
    document.body.append(box);
    document.body.classList.add('sost-in-stampa', 'us-stampa-piano');
    // dopo la stampa si toglie tutto (anche se la stampa è stata annullata)
    window.addEventListener('afterprint', () => { document.body.classList.remove('sost-in-stampa', 'us-stampa-piano'); box.remove(); }, { once: true });
    window.print();
  }

  // Il piano di UN giorno, in HTML da stampare ('' se quel giorno non ci sono uscite)
  function pianoStampaHtml(iso) {
    const p = piano(iso); if (!p) return '';
    const mo = m(), qui = usciteDel(iso), nome = id => esc(mo.nomeDocente(id));
    const simulazione = qui.some(u => !confermata(u));
    const giorno = new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const giaRecupero = mo.assenzeDel(iso).filter(a => a.come === 'recupero');
    const nota = c => c.tipo === 'liberato' ? 'liberato dall\'uscita (nessuna ora in più)' : c.tipo === 'normale' ? '+1 nel conteggio' : 'DA COPRIRE';
    return `<h2>🚌 Piano per l'uscita didattica · ${esc(giorno)}</h2>
      ${simulazione ? '<p><b>SIMULAZIONE – non ancora confermata</b></p>' : ''}
      <table class="sost-tabella"><caption>Uscite</caption>
        <thead><tr><th scope="col">Uscita</th><th scope="col">Classi fuori</th><th scope="col">Ore</th><th scope="col">Accompagnatori</th></tr></thead>
        <tbody>${qui.map(u => `<tr><th scope="row">${esc(u.nome || 'Uscita didattica')}</th><td>${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))}</td>
          <td>${oreTesto(u.ore)}</td><td>${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}</td></tr>`).join('')}</tbody></table>
      ${p.coperture.length ? `<table class="sost-tabella"><caption>Ore da coprire</caption>
        <thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Assente</th><th scope="col">Copre</th><th scope="col">Note</th></tr></thead>
        <tbody>${p.coperture.map(c => `<tr><th scope="row">${esc(mo.testoOra(c.l.ora))}</th><td>${esc(mo.nome('classe', c.l.classe))}</td>
          <td>${nome(c.l.assente)}</td><td>${c.docente ? nome(c.docente) : '—'}</td><td>${nota(c)}</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.recuperi.length || giaRecupero.length ? `<table class="sost-tabella"><caption>Entrano dopo o escono prima (ore a recupero)</caption>
        <thead><tr><th scope="col">Docente</th><th scope="col">Ore a recupero</th></tr></thead>
        <tbody>${p.recuperi.map(r => `<tr><th scope="row">${nome(r.docente)}</th><td>${[r.prima.length ? `entra alla ${r.entra}ª ora (${oreTesto(r.prima)})` : '',
          r.dopo.length ? `esce dopo la ${r.esce}ª ora (${oreTesto(r.dopo)})` : ''].filter(Boolean).join(' e ')}</td></tr>`).join('')}
          ${giaRecupero.map(a => `<tr><th scope="row">${nome(a.docente)}</th><td>${oreTesto(a.ore)} ora (già registrate)</td></tr>`).join('')}</tbody></table>` : ''}
      ${p.disposizione.length ? `<table class="sost-tabella"><caption>A disposizione (restano a scuola, nessun recupero)</caption>
        <thead><tr><th scope="col">Docente</th><th scope="col">Ore</th><th scope="col">Perché</th></tr></thead>
        <tbody>${p.disposizione.map(d => `<tr><th scope="row">${nome(d.docente)}</th><td>${oreTesto(d.ore)}</td><td>${esc(d.perche)}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }

  // «✔ Conferma tutti i giorni» di una gita: un giorno dopo l'altro (il foglio del conteggio si aggiorna in fila)
  async function confermaGiorni(giorni) {
    if (!permesso()) return;
    for (const d of giorni) if (piano(d)) await applica(d);
  }
  // «↺ Azzera tutti i giorni»: una sola domanda, poi toglie le uscite di quei giorni
  async function azzeraGiorni(giorni) {
    const qui = uscite.filter(u => giorni.includes(u.data)); if (!qui.length) return;
    if (!confirm(`Togliere le uscite di tutti i ${giorni.length} giorni?` + (qui.some(confermata) ? ' Quelle già confermate tolgono anche sostituzioni, assenze e recuperi.' : ''))) return;
    for (const u of qui) await togli(u.id, true);
  }

  // ---------- Eventi ----------
  function clic(e) {
    const b = e.target.closest('button[data-us]'); if (!b || b.disabled) return;
    const a = b.dataset.us;
    if (a === 'registra') registra(scelta.data);
    else if (a === 'togli') togli(b.dataset.id);
    else if (a === 'applica') applica(b.dataset.data);
    else if (a === 'azzera') azzera(b.dataset.data);
    else if (a === 'azzeraTutto') azzeraTutto();
    else if (a === 'stampa') stampaPiano(b.dataset.data);
    // gite di più giorni: data-giorni = "2026-09-28,2026-09-29,…"
    else if (a === 'vai') m().vaiA(b.dataset.data);
    else if (a === 'stampaGiorni') stampaPiano(b.dataset.giorni.split(','));
    else if (a === 'confermaGiorni') confermaGiorni(b.dataset.giorni.split(','));
    else if (a === 'azzeraGiorni') azzeraGiorni(b.dataset.giorni.split(','));
  }
  function cambio(e) {
    const c = e.target.closest('[data-us]'); if (!c) return;
    const a = c.dataset.us;
    if (a === 'nome') { scelta.nome = c.value; return; }   // solo testo: niente ridisegno (si perderebbe il cursore)
    if (a === 'fino') { scelta.fino = c.value; return; }
    if (e.type === 'input') return;
    if (a === 'classe') { c.checked ? scelta.classi.add(c.value) : scelta.classi.delete(c.value); }
    else if (a === 'ora') {
      const giorno = m().giornoOrario(scelta.data);
      if (!scelta.ore) scelta.ore = new Set(oreDelGiorno(giorno));
      c.checked ? scelta.ore.add(Number(c.value)) : scelta.ore.delete(Number(c.value));
    } else if (a === 'acc') { c.checked ? scelta.accompagnatori.add(c.value) : scelta.accompagnatori.delete(c.value); }
    else if (a === 'scegli') { c.value ? forzate.set(c.dataset.chiave, c.value) : forzate.set(c.dataset.chiave, '__nessuno'); }
    // dopo il ridisegno il cursore torna sulla stessa casella (per chi usa la tastiera)
    const selettore = `[data-us="${a}"]` + (a === 'scegli' ? `[data-chiave="${CSS.escape(c.dataset.chiave)}"]` : `[value="${CSS.escape(c.value)}"]`);
    m().ridisegna();
    const di = document.querySelector(selettore); if (di) di.focus();
  }

  // Se le uscite cambiano in un'altra scheda del browser, le rileggiamo (il motore poi ridisegna)
  window.addEventListener('storage', e => { if (e.key === 'sostituzioni.uscite') uscite = Archivio.leggi('uscite', []); });

  return { usciteDel, classeFuori, accompagna, liberato, piano, disegnaModulo, disegnaPiano, tabellaStampa };
})();

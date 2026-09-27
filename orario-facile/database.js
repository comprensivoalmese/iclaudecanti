/*
  database.js – il FILE DATABASE dell'orario: un Foglio Google (ID in app/js/config.js, voce "fileDatabaseOrario").
  Orario Facile lo carica («📥 Carica dal Foglio») e ci salva («📤 Salva sul Foglio»), nella scheda Esporta.
  Il formato del Foglio (schede, colonne, scrittura delle celle della griglia) è descritto in orario-facile/DATABASE.md.

  Cosa legge e scrive: SOLO le colonne «dati» (gialle nel Foglio). Le colonne calcolate (grigie: formule, controlli,
  Vista classi) le lascia stare, così continuano a funzionare anche dopo un salvataggio.
  I nomi veri dei docenti (scheda Docenti: Cognome in colonna B, Nome in colonna C) restano solo in memoria:
  mai in S, nel backup o in localStorage. Da lì li legge anche app/js/nomi.js per mostrarli nell'app.
  Legge anche i Fogli creati prima del 27/09/2026 (Docenti: B «Nome (vero)» e C «Aule»), per passare al formato nuovo.

  Usa di Orario Facile (index.html): S, POOL, uid, normalizza, save, render, vai, avvisa, chiedi, NOMI, GIORNI_ALL;
  di app/js/nomi.js: NomiDocenti.gettone (il permesso di Google di chi ha fatto l'accesso).
*/
const DatabaseOrario = (() => {
  const API = 'https://sheets.googleapis.com/v4/spreadsheets/';
  const PERMESSO_FOGLI = 'https://www.googleapis.com/auth/spreadsheets';
  // Dimensioni fisse del modello: le stesse del Foglio (non cambiarle senza rifare il Foglio)
  const ND = 120, NK = 400, NCL = 40, NDIS = 40, NAULE = 80, NVINC = 40, SLOT_MAX = 60, MAX_SIGLE = 39;
  const CHIAVE_IMPRONTA = 'orariofacile.dbImpronta';   // impronta dell'ultimo contenuto letto/scritto (niente dati)

  const id = () => (typeof CONFIG !== 'undefined' && CONFIG.fileDatabaseOrario) || '';
  const configurato = () => !!id() && typeof NomiDocenti !== 'undefined';
  const email = () => { const s = typeof Accesso !== 'undefined' && Accesso.sessione ? Accesso.sessione() : null; return s ? s.email : ''; };
  // confronto senza maiuscole, accenti e spazi doppi
  const semplice = v => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const testo = v => (v == null ? '' : String(v)).trim();
  const numero = (v, d) => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? d : n; };
  const siNo = v => ['si', 'sì', 'true', 'vero', '1', 'x', 'yes'].includes(semplice(v));
  const SI = v => (v ? 'SI' : 'NO');

  // nomi veri letti dal Foglio (codice -> { cognome, nome }), solo in memoria
  let nomiFoglio = new Map();

  /* ---------------- chiamate a Google ---------------- */
  function spiega(stato, t) {
    if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(t)) return 'nel progetto Google Cloud va attivata la "Google Sheets API"';
    if (stato === 404) return 'Foglio database non trovato, oppure il tuo account non può aprirlo';
    if (stato === 403) return 'il tuo account non ha il permesso su questo Foglio (serve «Editor» per salvare)';
    if (stato === 401) return 'il permesso di Google è scaduto: riprova';
    if (stato === 400 && /Unable to parse range/i.test(t)) return 'nel Foglio manca una delle schede (Impostazioni, Vincoli, Discipline, Aule, Classi, Quadro, Docenti, Cattedre, Orario)';
    return 'errore ' + stato + ' da Google';
  }
  async function chiama(percorso, metodo, corpo) {
    const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, PERMESSO_FOGLI], email());
    const r = await fetch(API + encodeURIComponent(id()) + percorso, {
      method: metodo || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + t }, corpo ? { 'Content-Type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    const risposta = await r.text();
    if (!r.ok) throw new Error(spiega(r.status, risposta));
    return risposta ? JSON.parse(risposta) : {};
  }

  // Le zone lette dal Foglio (le stesse che poi si scrivono)
  const ZONE = {
    impostazioni: 'Impostazioni!A2:B30', vincoli: `Vincoli!A2:C${NVINC + 1}`, discipline: `Discipline!A2:H${NDIS + 1}`,
    aule: `Aule!A2:C${NAULE + 1}`, classi: `Classi!A1:N${NCL + 1}`, quadro: `Quadro!A1:AN${NCL + 1}`,
    docentiTitoli: 'Docenti!A1:L1', docenti: `Docenti!A2:L${ND + 1}`,   // si legge fino a L: le colonne si cercano per titolo cattedre: `Cattedre!A2:E${NK + 1}`, orario: `Orario!A1:BJ${ND + 2}`
  };
  async function leggiZone() {
    const q = Object.values(ZONE).map(z => 'ranges=' + encodeURIComponent(z)).join('&');
    const r = await chiama('/values:batchGet?' + q + '&valueRenderOption=FORMATTED_VALUE');
    const out = {}; Object.keys(ZONE).forEach((k, i) => { out[k] = (r.valueRanges[i] && r.valueRanges[i].values) || []; });
    return out;
  }
  // impronta del contenuto: serve a capire se qualcuno ha cambiato il Foglio dopo l'ultimo caricamento
  function impronta(z) {
    const s = JSON.stringify(z); let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return String(h);
  }
  const leggiImpronta = () => { try { return localStorage.getItem(CHIAVE_IMPRONTA + '.' + id()) || ''; } catch (e) { return ''; } };
  const salvaImpronta = v => { try { localStorage.setItem(CHIAVE_IMPRONTA + '.' + id(), v); } catch (e) { /* ignorato */ } };

  /* ---------------- scrittura breve delle celle della griglia ---------------- */
  // "1A", "1A STO", "1A ITA @MENSA", "+2B SOS", "... *"  ->  { piu, classe, sigla, aula, blocco }
  function leggiCella(v) {
    let t = testo(v); if (!t) return null;
    const piu = t.startsWith('+'); if (piu) t = t.slice(1).trim();
    const parti = t.split(/\s+/); const r = { piu, classe: parti.shift(), sigla: '', aula: '', blocco: false };
    parti.forEach(p => { if (p === '*') r.blocco = true; else if (p.startsWith('@')) r.aula = p.slice(1); else if (!r.sigla) r.sigla = p; else r.sigla += ' ' + p; });
    return r;
  }
  const etichettaOra = (s, oreM) => s < oreM ? (s + 1) + 'ª' : (s - oreM + 1) + 'ª pom.';

  /*
    Colonne della scheda Docenti, trovate per titolo nella riga 1 (-1 = colonna che non c'è).
    standard = true se sono esattamente nell'ordine del modello (A Codice, B Cognome, C Nome, D Aule, E Giorno libero,
    F Max ore al giorno, G Max ore consecutive, H Indisponibilità); vecchio = true se è il modello di prima del
    27/09/2026 (A Codice, B «Nome (vero)», C Aule, D Giorno libero, E Max ore al giorno, F Max ore consecutive, G Indisp.).
  */
  function colonneDocenti(riga1) {
    const t = (riga1 || []).map(semplice);
    const trova = f => t.findIndex(f);
    const c = {
      codice: trova(x => x === 'codice'), cognome: trova(x => x === 'cognome'), nome: trova(x => x === 'nome'),
      nomeVero: trova(x => /^nome\s*\(?\s*vero/.test(x)), aule: trova(x => x.startsWith('aule')),
      libero: trova(x => x.startsWith('giorno libero')), maxG: trova(x => x.startsWith('max ore al giorno')),
      maxC: trova(x => x.startsWith('max ore consecutive')), indisp: trova(x => x.startsWith('indisponibilita'))
    };
    const ordine = (...k) => k.every((nome, i) => c[nome] === i);
    c.standard = ordine('codice', 'cognome', 'nome', 'aule', 'libero', 'maxG', 'maxC', 'indisp');
    c.vecchio = ordine('codice', 'nomeVero', 'aule', 'libero', 'maxG', 'maxC', 'indisp');
    return c;
  }
  // { cognome, nome } di una riga della scheda Docenti (nel modello vecchio il nome intero sta in «Nome (vero)»)
  function nomeDellaRiga(r, COL) {
    if (COL.cognome >= 0) return { cognome: testo(r[COL.cognome]), nome: COL.nome >= 0 ? testo(r[COL.nome]) : '' };
    return { cognome: COL.nomeVero >= 0 ? testo(r[COL.nomeVero]) : '', nome: '' };
  }

  /* ---------------- Foglio -> dati di Orario Facile ---------------- */
  function daFoglio(z) {
    const problemi = [];
    const nuovo = statoVuoto();
    nuovo.ui = Object.assign(nuovo.ui, (S && S.ui) || {});
    // Impostazioni: voce -> valore
    const imp = {}; z.impostazioni.forEach(r => { if (testo(r[0])) imp[semplice(r[0])] = testo(r[1]); });
    const valoreImp = (...chiavi) => { for (const k of chiavi) { const x = Object.keys(imp).find(v => v.startsWith(k)); if (x !== undefined) return imp[x]; } return ''; };
    // (il vecchio nome predefinito «Istituto Comprensivo» diventa quello completo della scuola)
    nuovo.meta.nome = (valoreImp('scuola') !== 'Istituto Comprensivo' && valoreImp('scuola')) || nuovo.meta.nome;
    nuovo.meta.anno = valoreImp('anno') || nuovo.meta.anno;
    nuovo.meta.durata = numero(valoreImp('durata'), nuovo.meta.durata);
    nuovo.meta.inizio = valoreImp('inizio') || nuovo.meta.inizio;
    nuovo.meta.versioneDati = valoreImp('versione') || '';
    nuovo.oreM = numero(valoreImp('ore del mattino', 'ore mattino'), nuovo.oreM);
    nuovo.oreP = numero(valoreImp('ore del pomeriggio', 'ore pomeriggio'), nuovo.oreP);
    const giorniLetti = valoreImp('giorni').split(/[,;]/).map(testo).filter(Boolean)
      .map(g => GIORNI_ALL.find(x => semplice(x) === semplice(g)) || g);
    if (giorniLetti.length) nuovo.giorni = giorniLetti;
    const sconosciuti = nuovo.giorni.filter(g => !GIORNI_ALL.includes(g));
    if (sconosciuti.length) problemi.push('Giorni non riconosciuti in Impostazioni: ' + sconosciuti.join(', '));
    nuovo.giorni = nuovo.giorni.filter(g => GIORNI_ALL.includes(g));
    const T = nuovo.oreM + nuovo.oreP;
    if (nuovo.giorni.length * T > SLOT_MAX) problemi.push(`Troppe ore nella settimana (${nuovo.giorni.length * T}): la griglia ne ha al massimo ${SLOT_MAX}`);

    // Vincoli: voce -> valore (SI/NO diventano vero/falso)
    z.vincoli.forEach(r => {
      const k = testo(r[0]); if (!k || !(k in nuovo.vincoli)) { if (k) problemi.push('Vincolo sconosciuto ignorato: ' + k); return; }
      nuovo.vincoli[k] = typeof nuovo.vincoli[k] === 'boolean' ? siNo(r[1]) : numero(r[1], nuovo.vincoli[k]);
    });

    // Discipline (per sigla)
    const perSigla = new Map();
    z.discipline.forEach((r, i) => {
      const sigla = testo(r[0]).toUpperCase(); if (!sigla) return;
      if (perSigla.has(sigla)) { problemi.push(`Discipline, riga ${i + 2}: sigla ${sigla} ripetuta`); return; }
      const d = { id: uid('d'), sigla, nome: testo(r[1]) || sigla, oreStd: numero(r[2], 1), principale: siNo(r[3]), blocchi2: siNo(r[4]),
        ultimaOra: siNo(r[6]), hue: numero(r[7], Math.round(Math.random() * 360)) };
      if (testo(r[5])) d.modoBlocchi = testo(r[5]);
      nuovo.discipline.push(d); perSigla.set(sigla, d);
    });
    // Aule (per nome)
    const perAula = new Map();
    z.aule.forEach(r => {
      const nome = testo(r[0]); if (!nome) return;
      const a = { id: uid('a'), nome, tipo: testo(r[1]) || 'Aula', contemporanea: siNo(r[2]) };
      nuovo.aule.push(a); perAula.set(semplice(nome), a);
    });
    // Classi: la riga 1 dice quale colonna è «Lunedì mattino», «Lunedì pomeriggio»...
    const perClasse = new Map();
    const intestClassi = (z.classi[0] || []).map(semplice);
    z.classi.slice(1).forEach((r, i) => {
      const nome = testo(r[0]); if (!nome) return;
      if (perClasse.has(semplice(nome))) { problemi.push(`Classi, riga ${i + 2}: classe ${nome} ripetuta`); return; }
      const c = { id: uid('c'), nome, anno: numero(r[1], parseInt(nome, 10) || 1), g: {} };
      GIORNI_ALL.forEach(g => {
        const cm = intestClassi.indexOf(semplice(g + ' mattino')), cp = intestClassi.indexOf(semplice(g + ' pomeriggio'));
        c.g[g] = { m: cm >= 0 ? numero(r[cm], 0) : 0, p: cp >= 0 ? numero(r[cp], 0) : 0 };
      });
      nuovo.classi.push(c); perClasse.set(semplice(nome), c);
    });
    // Quadro: riga 1 = sigle delle materie
    const sigleQuadro = (z.quadro[0] || []).map(v => testo(v).toUpperCase());
    z.quadro.slice(1).forEach((r, i) => {
      const c = perClasse.get(semplice(r[0])); if (!testo(r[0])) return;
      if (!c) { problemi.push(`Quadro, riga ${i + 2}: la classe ${testo(r[0])} non è nella scheda Classi`); return; }
      nuovo.quadro[c.id] = {};
      sigleQuadro.forEach((sg, j) => {
        if (!j || !sg) return; const d = perSigla.get(sg); const ore = numero(r[j], 0);
        if (!d) { if (ore) problemi.push(`Quadro: la materia ${sg} non è nella scheda Discipline`); return; }
        if (ore) nuovo.quadro[c.id][d.id] = ore;
      });
    });
    // Docenti (per codice); il nome vero resta solo in memoria
    const perDoc = new Map(); nomiFoglio = new Map();
    // le colonne si trovano per titolo (riga 1), così funziona anche se nel Foglio sono state inserite o spostate colonne
    const COL = colonneDocenti(z.docentiTitoli[0]);
    if (COL.codice < 0) problemi.push('Scheda Docenti: nella riga 1 manca la colonna «Codice»');
    z.docenti.forEach((r, i) => {
      const codice = testo(r[COL.codice]); if (!codice) return;
      if (perDoc.has(codice)) { problemi.push(`Docenti, riga ${i + 2}: codice ${codice} ripetuto`); return; }
      const t = { id: uid('t'), nome: codice, cattedre: [], aule: [], indisp: {}, giornoLibero: '', maxGiorno: numero(r[COL.maxG], 0), maxConsec: numero(r[COL.maxC], 0) };
      // nome vero (solo in memoria)
      const n = nomeDellaRiga(r, COL); if (n.cognome || n.nome) nomiFoglio.set(codice, n);
      testo(r[COL.aule]).split(/[,;]/).map(testo).filter(Boolean).forEach(n => {
        const a = perAula.get(semplice(n)); if (a) t.aule.push(a.id); else problemi.push(`Docente ${codice}: l'aula ${n} non è nella scheda Aule`);
      });
      const libero = r[COL.libero];
      const gl = GIORNI_ALL.find(g => semplice(g) === semplice(libero)); if (gl) t.giornoLibero = gl; else if (testo(libero)) problemi.push(`Docente ${codice}: giorno libero «${testo(libero)}» non riconosciuto`);
      // Indisponibilità: "Lunedì 1,2; Venerdì 6,p1" (p1 = 1ª ora del pomeriggio)
      testo(r[COL.indisp]).split(';').map(testo).filter(Boolean).forEach(parte => {
        const m = parte.match(/^(\S+)\s+(.+)$/); const g = m && GIORNI_ALL.find(x => semplice(x) === semplice(m[1]));
        if (!g) { problemi.push(`Docente ${codice}: indisponibilità «${parte}» non capita`); return; }
        t.indisp[g] = m[2].split(',').map(testo).filter(Boolean).map(o => /^p/i.test(o) ? nuovo.oreM + numero(o.slice(1), 1) - 1 : numero(o, 1) - 1).filter(s => s >= 0 && s < T);
      });
      nuovo.docenti.push(t); perDoc.set(codice, t);
    });
    // Cattedre
    z.cattedre.forEach((r, i) => {
      const codice = testo(r[0]), cl = testo(r[2]), sg = testo(r[3]).toUpperCase(); if (!codice && !cl) return;
      const t = perDoc.get(codice), c = perClasse.get(semplice(cl)), d = perSigla.get(sg);
      if (!t || !c || !d) { problemi.push(`Cattedre, riga ${i + 2}: ${!t ? 'docente ' + (codice || '(vuoto)') : !c ? 'classe ' + (cl || '(vuota)') : 'materia ' + (sg || '(vuota)')} sconosciuto/a`); return; }
      t.cattedre.push({ cl: c.id, di: d.id, ore: numero(r[4], 1) });
    });
    // Orario: la griglia docente x ora
    nuovo.classi.forEach(c => { nuovo.orario[c.id] = {}; nuovo.giorni.forEach(g => { nuovo.orario[c.id][g] = new Array(T).fill(null); }); });
    const compresenze = [];
    z.orario.slice(2).forEach((r, i) => {
      const codice = testo(r[0]); if (!codice) return;
      const t = perDoc.get(codice); if (!t) { problemi.push(`Orario, riga ${i + 3}: il docente ${codice} non è nella scheda Docenti`); return; }
      for (let k = 0; k < nuovo.giorni.length * T; k++) {
        const x = leggiCella(r[k + 2]); if (!x) continue;
        const g = nuovo.giorni[Math.floor(k / T)], s = k % T, dove = `${codice} ${g} ${etichettaOra(s, nuovo.oreM)}`;
        const c = perClasse.get(semplice(x.classe));
        if (!c) { problemi.push(`Orario, ${dove}: classe «${x.classe}» sconosciuta`); continue; }
        if (x.piu) { compresenze.push({ c, g, s, doc: t.id, att: x.sigla, dove }); continue; }
        // materia: la sigla scritta, altrimenti l'unica materia del docente in quella classe
        let di = '';
        if (x.sigla) { const d = perSigla.get(x.sigla.toUpperCase()); if (d) di = d.id; else problemi.push(`Orario, ${dove}: materia «${x.sigla}» sconosciuta`); }
        else {
          const mat = [...new Set(t.cattedre.filter(k2 => k2.cl === c.id).map(k2 => k2.di))];
          if (mat.length === 1) di = mat[0];
          else problemi.push(`Orario, ${dove}: ${mat.length ? 'il docente ha più materie in ' + c.nome + ', scrivi la sigla (es. ' + c.nome + ' ' + nuovo.discipline.find(d => d.id === mat[0]).sigla + ')' : 'il docente non ha cattedre in ' + c.nome + ', scrivi la sigla'}`);
        }
        let aula = t.aule[0] || '';
        if (x.aula) { const a = perAula.get(semplice(x.aula)); if (a) aula = a.id; else problemi.push(`Orario, ${dove}: aula «${x.aula}» sconosciuta`); }
        if (nuovo.orario[c.id][g][s]) { problemi.push(`Orario, ${dove}: ${c.nome} ha già un altro docente in quest'ora (scrivi + davanti se è una compresenza)`); continue; }
        nuovo.orario[c.id][g][s] = { doc: t.id, dis: di, aula, lock: x.blocco };
      }
    });
    compresenze.forEach(p => {
      const v = nuovo.orario[p.c.id][p.g][p.s];
      if (!v) { problemi.push(`Orario, ${p.dove}: compresenza in ${p.c.nome} ma nessun docente titolare in quell'ora`); return; }
      v.co = v.co || []; v.co.push(p.att ? { doc: p.doc, att: p.att } : { doc: p.doc });
    });
    const lezioni = Object.values(nuovo.orario).reduce((n, gg) => n + Object.values(gg).reduce((m, a) => m + a.filter(Boolean).length, 0), 0);
    return { stato: nuovo, problemi, lezioni };
  }

  /* ---------------- dati di Orario Facile -> Foglio ---------------- */
  // riempie una tabella fino a "righe" x "colonne" con celle vuote (così si cancellano i resti vecchi)
  const piena = (valori, righe, colonne) => {
    const out = valori.slice(0, righe).map(r => { const x = r.slice(0, colonne).map(v => v == null ? '' : v); while (x.length < colonne) x.push(''); return x; });
    while (out.length < righe) out.push(new Array(colonne).fill(''));
    return out;
  };
  // { cognome, nome } del docente: quelli che sono già nel Foglio (la fonte dei nomi); se lì mancano, quelli mostrati
  // in Orario Facile con «👁 Nomi» (serve per il primo passaggio dal vecchio file dei nomi)
  function nomeVeroDi(codice) {
    const f = nomiFoglio.get(codice);
    if (f && (f.cognome || f.nome)) return f;
    const n = typeof NOMI !== 'undefined' && NOMI && NOMI.get(codice);
    return n ? { cognome: n.cognome || '', nome: n.nome || '' } : { cognome: '', nome: '' };
  }
  const TITOLI_DOCENTI = ['Codice', 'Cognome', 'Nome', 'Aule (la prima è la principale)', 'Giorno libero', 'Max ore al giorno',
    'Max ore consecutive', 'Indisponibilità (es. Lunedì 1,2; Venerdì 6)'];
  const SPIEGAZIONI = {
    maxConsec: 'ore consecutive massime della stessa materia per classe', maxConsecDoc: 'ore consecutive massime per docente',
    maxOreGiorno: 'ore massime al giorno per docente', maxOreDiscGiorno: 'ore massime della stessa materia al giorno',
    rispettaIndisp: 'rispettare le indisponibilità dei docenti (SI/NO)', giornoLibero: 'dare il giorno libero ai docenti (SI/NO)'
  };
  function aFoglio(st) {
    const T = st.oreM + st.oreP, avvisi = [];
    const d = id2 => st.discipline.find(x => x.id === id2), a = id2 => st.aule.find(x => x.id === id2), c = id2 => st.classi.find(x => x.id === id2);
    const out = [];
    const metti = (range, values) => out.push({ range, values });
    metti('Impostazioni!A2:B9', [['Scuola', st.meta.nome], ['Anno scolastico', st.meta.anno], ['Durata ora (minuti)', st.meta.durata],
      ['Inizio lezioni', st.meta.inizio], ['Ore del mattino', st.oreM], ['Ore del pomeriggio', st.oreP], ['Giorni', st.giorni.join(', ')],
      ['Versione dati', st.meta.versioneDati || '']]);
    metti(ZONE.vincoli, piena(Object.keys(st.vincoli).map(k => [k, typeof st.vincoli[k] === 'boolean' ? SI(st.vincoli[k]) : st.vincoli[k],
      SPIEGAZIONI[k] || (k.startsWith('peso') ? 'importanza per il generatore automatico (0-10)' : '')]), NVINC, 3));
    metti(ZONE.discipline, piena(st.discipline.map(x => [x.sigla, x.nome, x.oreStd, SI(x.principale), SI(x.blocchi2), x.modoBlocchi || '', SI(x.ultimaOra), x.hue]), NDIS, 8));
    metti(ZONE.aule, piena(st.aule.map(x => [x.nome, x.tipo, SI(x.contemporanea)]), NAULE, 3));
    const intest = ['Classe', 'Anno']; st.giorni.forEach(g => intest.push(g + ' mattino', g + ' pomeriggio'));
    metti(ZONE.classi, piena([intest].concat(st.classi.map(x => { const r = [x.nome, x.anno]; st.giorni.forEach(g => r.push((x.g[g] || {}).m || 0, (x.g[g] || {}).p || 0)); return r; })), NCL + 1, 14));
    if (st.discipline.length > MAX_SIGLE) avvisi.push(`Nel Quadro entrano ${MAX_SIGLE} materie: le altre non sono state salvate`);
    const sigle = st.discipline.slice(0, MAX_SIGLE);
    metti(ZONE.quadro, piena([['Classe'].concat(sigle.map(x => x.sigla))].concat(st.classi.map(x => [x.nome].concat(sigle.map(dd => (st.quadro[x.id] || {})[dd.id] || '')))), NCL + 1, 40));
    const indisp = t => Object.keys(t.indisp || {}).filter(g => (t.indisp[g] || []).length)
      .map(g => g + ' ' + t.indisp[g].slice().sort((x, y) => x - y).map(s => s < st.oreM ? s + 1 : 'p' + (s - st.oreM + 1)).join(',')).join('; ');
    metti('Docenti!A1:H1', [TITOLI_DOCENTI]);
    metti(`Docenti!A2:H${ND + 1}`, piena(st.docenti.map(t => { const n = nomeVeroDi(t.nome); return [t.nome, n.cognome, n.nome,
      t.aule.map(x => (a(x) || {}).nome).filter(Boolean).join(', '), t.giornoLibero || '', t.maxGiorno || '', t.maxConsec || '', indisp(t)]; }), ND, 8));
    if (st.docenti.length > ND) avvisi.push(`Nel Foglio entrano ${ND} docenti: gli altri non sono stati salvati`);
    const catt = []; st.docenti.forEach(t => t.cattedre.forEach(k => { if (c(k.cl) && d(k.di)) catt.push([t.nome, c(k.cl).nome, d(k.di).sigla, k.ore]); }));
    if (catt.length > NK) avvisi.push(`Nel Foglio entrano ${NK} cattedre: le altre non sono state salvate`);
    metti(`Cattedre!A2:A${NK + 1}`, piena(catt.map(r => [r[0]]), NK, 1));
    metti(`Cattedre!C2:E${NK + 1}`, piena(catt.map(r => r.slice(1)), NK, 3));
    // griglia: intestazioni (giorni e ore) e una riga per docente
    const r1 = [], r2 = [];
    st.giorni.forEach(g => { for (let s = 0; s < T; s++) { r1.push(s === 0 ? g : ''); r2.push(etichettaOra(s, st.oreM)); } });
    metti(`Orario!C1:BJ2`, piena([r1, r2], 2, SLOT_MAX));
    const riga = new Map(st.docenti.map(t => [t.id, new Array(st.giorni.length * T).fill('')]));
    st.classi.forEach(cl => st.giorni.forEach((g, gi) => (((st.orario[cl.id] || {})[g]) || []).forEach((v, s) => {
      if (!v || !v.doc || !riga.has(v.doc) || s >= T) return;
      const t = st.docenti.find(x => x.id === v.doc), k = gi * T + s;
      const mat = [...new Set(t.cattedre.filter(x => x.cl === cl.id).map(x => x.di))];
      let txt = cl.nome;
      if (v.dis && d(v.dis) && !(mat.length === 1 && mat[0] === v.dis)) txt += ' ' + d(v.dis).sigla;
      if (v.aula && v.aula !== (t.aule[0] || '') && a(v.aula)) txt += ' @' + a(v.aula).nome;
      if (v.lock) txt += ' *';
      if (riga.get(v.doc)[k]) avvisi.push(`${t.nome} ha due lezioni ${g} ${etichettaOra(s, st.oreM)}: salvata solo la prima`); else riga.get(v.doc)[k] = txt;
      (v.co || []).forEach(x => { if (riga.has(x.doc)) riga.get(x.doc)[k] = '+' + cl.nome + (x.att ? ' ' + x.att : ''); });
    })));
    metti(`Orario!A3:A${ND + 2}`, piena(st.docenti.map(t => [t.nome]), ND, 1));
    metti(`Orario!C3:BJ${ND + 2}`, piena(st.docenti.map(t => riga.get(t.id)), ND, SLOT_MAX));
    return { dati: out, avvisi };
  }

  // Prima di salvare si rileggono i nomi veri che ci sono ADESSO nel Foglio (solo in memoria): i nomi si scrivono
  // nel Foglio e lì restano, così un salvataggio non li svuota e non li cambia (anche senza «👁 Nomi»).
  function ricordaNomiDelFoglio(z) {
    const COL = colonneDocenti(z.docentiTitoli[0]);
    nomiFoglio = new Map();
    z.docenti.forEach(r => {
      const codice = testo(r[COL.codice >= 0 ? COL.codice : 0]); if (!codice) return;
      const n = nomeDellaRiga(r, COL);
      if (n.cognome || n.nome) nomiFoglio.set(codice, n);
    });
  }

  /* ---------------- azioni dei tasti ---------------- */
  async function carica() {
    const z = await leggiZone();
    const r = daFoglio(z);
    r.impronta = impronta(z);
    return r;
  }
  function applica(r) {
    S = r.stato; POOL = []; normalizza(); save(true); salvaImpronta(r.impronta);
    if (typeof vai === 'function') vai('orario'); else render();
  }
  async function salva(forza) {
    // se qualcuno ha cambiato il Foglio dopo l'ultimo caricamento/salvataggio, non sovrascrivo senza chiedere
    const attuale = await leggiZone();
    const prima = impronta(attuale);
    const nota = leggiImpronta();
    if (!forza && nota && nota !== prima) return { modificatoDaAltri: true };
    // la scheda Docenti si riscrive nelle colonne A-H del modello: se ha colonne in posizioni diverse (inserite o
    // spostate a mano) non si salva, per non mescolare i dati
    const COL = colonneDocenti(attuale.docentiTitoli[0]);
    if (!COL.standard && !COL.vecchio) throw new Error('la scheda Docenti del Foglio ha le colonne in un ordine diverso dal modello ' +
      '(A Codice, B Cognome, C Nome, D Aule, E Giorno libero, F Max ore al giorno, G Max ore consecutive, H Indisponibilità): ' +
      'sistemala così, oppure reimporta il modello «Database.xlsx», poi salva di nuovo');
    ricordaNomiDelFoglio(attuale);
    const { dati, avvisi } = aFoglio(S);
    await chiama('/values:batchUpdate', 'POST', { valueInputOption: 'RAW', data: dati });
    salvaImpronta(impronta(await leggiZone()));
    return { avvisi, docenti: S.docenti.length, lezioni: Object.values(S.orario).reduce((n, gg) => n + Object.values(gg).reduce((m, x) => m + (x || []).filter(Boolean).length, 0), 0) };
  }

  /* ---------------- tasti nella scheda Esporta ---------------- */
  function tasti() {
    const $id = x => document.getElementById(x);
    const bCarica = $id('btnDbCarica'), bSalva = $id('btnDbSalva'), stato = $id('statoDb');
    if (!bCarica || !bSalva) return;
    const lavora = async (tasto, scritta, azione) => {
      const et = tasto.textContent; tasto.disabled = true; tasto.textContent = scritta;
      try { await azione(); } catch (e) { avvisa('Operazione non riuscita: ' + (e && e.message ? e.message : e) + '.'); }
      finally { tasto.disabled = false; tasto.textContent = et; }
    };
    const ora = () => new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    bCarica.addEventListener('click', () => {
      if (!configurato()) return avvisa('In app/js/config.js manca l\'ID del Foglio database (voce fileDatabaseOrario).');
      lavora(bCarica, '⏳ Lettura del Foglio…', async () => {
        const r = await carica();
        const elenco = r.problemi.length ? ` Attenzione, ${r.problemi.length} problemi: ${r.problemi.slice(0, 8).join(' · ')}${r.problemi.length > 8 ? ' · …' : ''}.` : ' Nessun problema trovato.';
        chiedi(`Nel Foglio ci sono ${r.stato.classi.length} classi, ${r.stato.docenti.length} docenti e ${r.lezioni} lezioni.${elenco} ` +
          'Caricandolo sostituisci i dati di Orario Facile su questo computer (conviene prima «Scarica backup»).', () => {
          applica(r); stato.textContent = `✔ Caricato dal Foglio alle ${ora()}.`;
        }, 'Carica');
      });
    });
    bSalva.addEventListener('click', () => {
      if (!configurato()) return avvisa('In app/js/config.js manca l\'ID del Foglio database (voce fileDatabaseOrario).');
      const esegui = forza => lavora(bSalva, '⏳ Salvataggio…', async () => {
        const r = await salva(forza);
        if (r.modificatoDaAltri) {
          chiedi('Il Foglio è stato modificato (a mano o da un altro computer) dopo l\'ultima volta che l\'hai caricato o salvato da qui. ' +
            'Se salvi ora, quelle modifiche vanno perse. Conviene prima «Carica dal Foglio». Salvare comunque?', () => esegui(true), 'Salva comunque', true);
          return;
        }
        stato.textContent = `✔ Salvato sul Foglio alle ${ora()} (${r.docenti} docenti, ${r.lezioni} lezioni).`;
        avvisa('Orario salvato sul Foglio database.' + (r.avvisi.length ? ' Attenzione: ' + r.avvisi.join(' · ') + '.' : ''));
      });
      chiedi('Salvare l\'orario di Orario Facile sul Foglio database? Le schede del Foglio vengono sostituite con questi dati.', () => esegui(false), 'Salva');
    });
  }
  tasti();

  return { configurato, carica, salva, daFoglio, aFoglio, leggiCella };
})();

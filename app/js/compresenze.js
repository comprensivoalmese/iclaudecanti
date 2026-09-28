/*
  compresenze.js – le ore di COMPRESENZA: un secondo docente in classe insieme al titolare di quell'ora
  (potenziamento L2, ore del tempo prolungato, Alternativa durante Religione, e altri casi).

  Da dove arrivano:
  1. il Foglio Google «Compresenze» (CONFIG.fileCompresenze), sul Drive della scuola: una riga per ogni ora,
     colonne Codice docente, Classe, Giorno, Ora, Tipo, Aula (facoltativa: vuota = aula del titolare), Note
     (le altre colonne, per esempio il nome, non si leggono). Si compila con la pagina «Compresenze» (compresenze-pagina.js).
     Si legge con il permesso Google di chi ha fatto l'accesso (lo stesso dei nomi veri, vedi nomi.js);
  2. le compresenze scritte in Orario Facile / nel Foglio database (celle «+2B SOS»), vedi daOrarioFacile in dati.js.

  Si vedono SOLO se è spuntato il quadratino «Compresenze» (scelta ricordata su questo dispositivo):
  altrimenti la tabella mostra solo le lezioni curricolari.
  Sul dispositivo si salva solo una copia con i codici (DOC01…), mai i nomi veri.
*/
const Compresenze = (() => {
  const CHIAVE_MOSTRA = 'orariodada.compresenze';        // '1' = mostra le compresenze
  const CHIAVE_COPIA = 'orariodada.copiaCompresenze';    // ultima copia del Foglio (solo codici), per quando manca la rete
  const GIORNI = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

  const leggi = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const scrivi = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignorato */ } };
  const semplice = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const mostra = () => leggi(CHIAVE_MOSTRA) === '1';
  const impostaMostra = si => scrivi(CHIAVE_MOSTRA, si ? '1' : '');

  // Righe lette dal Foglio: [{ codice, classe, giorno, ora, tipo }] (solo codici e nomi delle classi)
  let righe = null;
  try { righe = JSON.parse(leggi(CHIAVE_COPIA) || 'null'); } catch (e) { righe = null; }

  const configurato = () => typeof CONFIG !== 'undefined' && !!CONFIG.fileCompresenze;

  // Divide una riga CSV rispettando le virgolette ("a, b" resta una cella sola)
  function celleCsv(riga) {
    const out = []; let cur = '', dentro = false;
    for (let i = 0; i < riga.length; i++) {
      const ch = riga[i];
      if (ch === '"') { if (dentro && riga[i + 1] === '"') { cur += '"'; i++; } else dentro = !dentro; }
      else if (ch === ',' && !dentro) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim());
  }

  // Dal testo CSV del Foglio alle righe; le colonne si trovano per titolo nella prima riga
  function interpreta(testo) {
    const tutte = testo.replace(/^﻿/, '').split(/\r?\n/).filter(r => r.trim()).map(celleCsv);
    return righeDaTabella(tutte).filter(completa);
  }

  /*
    Dalla tabella del Foglio (prima riga = titoli) a tutte le righe, anche quelle incomplete (servono alla pagina
    di inserimento, vedi compresenze-pagina.js): { codice, classe, giorno, ora, tipo, aula, note }.
    Le colonne si trovano per titolo: Codice docente, Classe, Giorno, Ora, Tipo, Aula, Note (le altre si ignorano).
  */
  function righeDaTabella(tutte) {
    const titoli = (tutte[0] || []).map(semplice);
    const col = inizio => titoli.findIndex(t => t.startsWith(inizio));
    const c = { codice: col('codice'), classe: col('classe'), giorno: col('giorno'), ora: col('ora'), tipo: col('tipo'), aula: col('aula'), note: col('note'), nome: col('docente') };
    if (c.codice < 0 || c.classe < 0 || c.giorno < 0 || c.ora < 0) throw new Error('nel Foglio Compresenze servono le colonne Codice docente, Classe, Giorno, Ora');
    const v = (r, k) => c[k] >= 0 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : '';
    return tutte.slice(1).map(r => {
      const g = semplice(v(r, 'giorno')) ? GIORNI.find(x => semplice(x).startsWith(semplice(v(r, 'giorno')).slice(0, 3))) : '';
      return { codice: v(r, 'codice').toUpperCase(), classe: v(r, 'classe'), giorno: g || '', ora: parseInt(v(r, 'ora'), 10) || '',
        tipo: v(r, 'tipo'), aula: v(r, 'aula'), note: v(r, 'note'), nome: v(r, 'nome') };
    }).filter(x => x.codice || x.classe || x.giorno || x.ora || x.tipo || x.note);
  }
  // una riga è valida per l'orario solo con docente, classe, giorno e ora (ogni compresenza è di un docente)
  const completa = x => !!(x.codice && x.classe && x.giorno && x.ora > 0);

  /*
    SOSTEGNO – scheda «Sostegno» del Foglio (o di CONFIG.fileSostegno), fatta come l'orario definitivo scritto a mano:
    riga 1 i giorni (il nome del giorno sopra la sua prima ora), riga 2 le ore (1ª, 2ª…), dalla riga 3 un docente di
    sostegno per riga: A codice docente, B nome (facoltativo, non letto), poi in ogni ora la classe (es. 2B), vuota = libera.
    È un dato delicato (dice quali classi hanno alunni con disabilità): si legge solo per i docenti e chi modifica,
    resta SOLO IN MEMORIA (mai sul dispositivo) e non va mai su GitHub.
  */
  function righeDaGriglia(tab) {
    const r1 = tab[0] || [], r2 = tab[1] || [], colonne = [];
    let giorno = '', n = 0;
    for (let c = 2; c < Math.max(r1.length, r2.length); c++) {
      const g = String(r1[c] == null ? '' : r1[c]).trim();
      if (g) { giorno = GIORNI.find(x => semplice(x).startsWith(semplice(g).slice(0, 3))) || ''; n = 0; }
      // l'ora è la posizione dentro il giorno (1ª, 2ª… anche per le ore del pomeriggio)
      if (String(r2[c] == null ? '' : r2[c]).trim()) n++;
      colonne[c] = giorno && String(r2[c] == null ? '' : r2[c]).trim() ? { giorno, ora: n } : null;
    }
    const out = [];
    tab.slice(2).forEach(r => {
      const codice = String(r[0] || '').trim().toUpperCase(); if (!codice) return;
      for (let c = 2; c < r.length; c++) {
        const k = colonne[c], v = String(r[c] == null ? '' : r[c]).trim();
        if (k && v) out.push({ codice, classe: v.split(/\s+/)[0].replace(/^\+/, ''), giorno: k.giorno, ora: k.ora, tipo: 'Sostegno', aula: '' });
      }
    });
    return out;
  }
  let sostegno = [];          // le ore di sostegno lette dalla griglia (solo in memoria)
  let vedeSostegno = false;   // chi ha fatto l'accesso può vedere il sostegno (docente o chi modifica, vedi app.js)
  const fileSostegno = () => (typeof CONFIG !== 'undefined' && (CONFIG.fileSostegno || CONFIG.fileCompresenze)) || '';
  function impostaSostegno(si) { vedeSostegno = !!si; if (!vedeSostegno) sostegno = []; }
  // Legge la griglia del sostegno con la Sheets API (basta il permesso di lettura di Drive); true se è cambiata
  async function scaricaSostegno(t) {
    if (!vedeSostegno || !fileSostegno()) return false;
    const prima = JSON.stringify(sostegno);
    try {
      const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(fileSostegno()) + '/values/' + encodeURIComponent("'Sostegno'!A1:CZ300");
      const r = await fetch(url, { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
      sostegno = r.ok ? righeDaGriglia((await r.json()).values || []) : [];
    } catch (e) { /* senza rete: resta quello di prima */ }
    return JSON.stringify(sostegno) !== prima;
  }

  // La pagina di inserimento ha salvato il Foglio: si usano subito le righe nuove (solo quelle complete)
  function imposta(tutteLeRighe) {
    righe = tutteLeRighe.filter(completa).map(x => ({ codice: x.codice, classe: x.classe, giorno: x.giorno, ora: Number(x.ora), tipo: x.tipo, aula: x.aula || '' }));
    scrivi(CHIAVE_COPIA, JSON.stringify(senzaSostegno(righe)));
  }
  // la copia sul dispositivo non contiene mai ore di sostegno (dato delicato: solo in memoria)
  function senzaSostegno(elenco) { return elenco.filter(x => !/^sostegno/i.test(x.tipo)); }

  // Scarica il Foglio Compresenze (serve il permesso Google già ottenuto); true se è cambiato. Non lancia errori.
  async function scarica() {
    if (!configurato() || typeof NomiDocenti === 'undefined') return false;
    const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
    if (!t) return false;
    const cambiatoSostegno = await scaricaSostegno(t);
    const prima = JSON.stringify(righe);
    try {
      // un Foglio Google si "esporta" in CSV: si legge il PRIMO foglio del file
      const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(CONFIG.fileCompresenze) + '/export?mimeType=text/csv';
      const r = await fetch(url, { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return false;
      righe = interpreta(await r.text());
      scrivi(CHIAVE_COPIA, JSON.stringify(senzaSostegno(righe)));
    } catch (e) { return cambiatoSostegno; }
    return JSON.stringify(righe) !== prima || cambiatoSostegno;
  }

  /*
    Aggiorna D.lezioni: le lezioni curricolari (tenute da parte in D.lezioniCurricolari) più, se il quadratino è
    spuntato, le compresenze. Ogni compresenza è una lezione con compresenza: true, nell'aula del titolare.
    Va chiamata dopo ogni caricamento dell'orario e quando cambia il quadratino.
  */
  function applica(D) {
    if (!D) return;
    if (!D.lezioniCurricolari) D.lezioniCurricolari = D.lezioni;
    const base = D.lezioniCurricolari;
    if (!mostra()) { D.lezioni = base; return; }
    D.lezioni = base.concat(lezioni(D));
  }

  /*
    Tutte le compresenze come lezioni (compresenza: true), SENZA toccare D e senza guardare il quadratino:
    le usa anche il modulo «Sciopero / assemblea» (sostituzioni/js/scioperi.js) per sapere chi è in classe.
    Il sostegno c'è solo se chi usa la pagina lo può vedere (impostaSostegno).
  */
  function lezioni(D) {
    if (!D) return [];
    const base = D.lezioniCurricolari || D.lezioni;
    const titolare = (g, o, cl) => base.find(l => l.giorno === g && l.ora === o && l.classe === cl);
    const perClasse = new Map(D.classe.map(c => [semplice(c.nome), c.id]));
    const perCodice = new Map(D.docente.map(e => [String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase(), e.id]));
    const perAula = new Map(D.aula.map(a => [semplice(a.nome), a.id]));
    const extra = [];
    // le ore di sostegno si aggiungono solo per chi le può vedere (docenti e chi modifica)
    // (anche le righe del foglio principale con Tipo «Sostegno…», per sicurezza, solo per chi può vedere il sostegno)
    (righe || []).filter(x => vedeSostegno || !/^sostegno/i.test(x.tipo)).concat(vedeSostegno ? sostegno : []).forEach(x => {
      const classe = perClasse.get(semplice(x.classe)), docente = perCodice.get(x.codice);
      if (!classe || !docente) return;
      const t = titolare(x.giorno, x.ora, classe);
      // aula: quella scritta nel Foglio (per esempio l'Alternativa in un'altra aula), altrimenti quella del titolare
      const aula = (x.aula && perAula.get(semplice(x.aula))) || (t ? t.aula : '');
      extra.push({ giorno: x.giorno, ora: x.ora, classe, docente, materia: x.tipo || 'Compresenza', aula, compresenza: true });
    });
    // quelle di Orario Facile (celle «+»), se non sono già nel Foglio Compresenze
    (D.compresenzeOF || []).forEach(l => {
      if (!extra.some(x => x.giorno === l.giorno && x.ora === l.ora && x.classe === l.classe && x.docente === l.docente)) extra.push(l);
    });
    return extra;
  }

  return { configurato, scarica, applica, lezioni, mostra, impostaMostra, interpreta, righeDaTabella, righeDaGriglia, completa, imposta, semplice,
    impostaSostegno, vedeSostegno: () => vedeSostegno, fileSostegno,
    // le righe complete del Foglio Compresenze (ultima copia letta), per l'«Orario di sintesi» di Orario Facile
    elenco: () => (righe || []).slice() };
})();

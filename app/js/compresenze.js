/*
  compresenze.js – le ore di COMPRESENZA: un secondo docente in classe insieme al titolare di quell'ora
  (potenziamento L2, ore del tempo prolungato, Alternativa durante Religione, e altri casi).

  Da dove arrivano:
  1. il Foglio Google «Compresenze» (CONFIG.fileCompresenze), sul Drive della scuola: una riga per ogni ora,
     colonne Codice docente, Classe, Giorno, Ora, Tipo (le altre colonne, per esempio il nome, non si leggono).
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
    const titoli = (tutte[0] || []).map(semplice);
    const col = inizio => titoli.findIndex(t => t.startsWith(inizio));
    const c = { codice: col('codice'), classe: col('classe'), giorno: col('giorno'), ora: col('ora'), tipo: col('tipo') };
    if (c.codice < 0 || c.classe < 0 || c.giorno < 0 || c.ora < 0) throw new Error('nel Foglio Compresenze servono le colonne Codice docente, Classe, Giorno, Ora');
    const out = [];
    tutte.slice(1).forEach(r => {
      const codice = String(r[c.codice] || '').trim().toUpperCase();
      const g = GIORNI.find(x => semplice(x).startsWith(semplice(r[c.giorno]).slice(0, 3)) && semplice(r[c.giorno]));
      const ora = parseInt(r[c.ora], 10);
      // righe incomplete (per esempio l'Alternativa senza docente) si saltano: si completano nel Foglio
      if (!codice || !r[c.classe] || !g || !(ora > 0)) return;
      out.push({ codice, classe: String(r[c.classe]).trim(), giorno: g, ora, tipo: c.tipo >= 0 ? String(r[c.tipo] || '').trim() : '' });
    });
    return out;
  }

  // Scarica il Foglio Compresenze (serve il permesso Google già ottenuto); true se è cambiato. Non lancia errori.
  async function scarica() {
    if (!configurato() || typeof NomiDocenti === 'undefined') return false;
    const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
    if (!t) return false;
    const prima = JSON.stringify(righe);
    try {
      // un Foglio Google si "esporta" in CSV: si legge il PRIMO foglio del file
      const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(CONFIG.fileCompresenze) + '/export?mimeType=text/csv';
      const r = await fetch(url, { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
      if (!r.ok) return false;
      righe = interpreta(await r.text());
      scrivi(CHIAVE_COPIA, JSON.stringify(righe));
    } catch (e) { return false; }
    return JSON.stringify(righe) !== prima;
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
    const titolare = (g, o, cl) => base.find(l => l.giorno === g && l.ora === o && l.classe === cl);
    const perClasse = new Map(D.classe.map(c => [semplice(c.nome), c.id]));
    const perCodice = new Map(D.docente.map(e => [String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase(), e.id]));
    const extra = [];
    (righe || []).forEach(x => {
      const classe = perClasse.get(semplice(x.classe)), docente = perCodice.get(x.codice);
      if (!classe || !docente) return;
      const t = titolare(x.giorno, x.ora, classe);
      extra.push({ giorno: x.giorno, ora: x.ora, classe, docente, materia: x.tipo || 'Compresenza', aula: t ? t.aula : '', compresenza: true });
    });
    // quelle di Orario Facile (celle «+»), se non sono già nel Foglio Compresenze
    (D.compresenzeOF || []).forEach(l => {
      if (!extra.some(x => x.giorno === l.giorno && x.ora === l.ora && x.classe === l.classe && x.docente === l.docente)) extra.push(l);
    });
    D.lezioni = base.concat(extra);
  }

  return { configurato, scarica, applica, mostra, impostaMostra, interpreta };
})();

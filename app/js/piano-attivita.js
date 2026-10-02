/*
  piano-attivita.js – trasforma il foglio del Piano annuale delle attività (Excel .xlsx, LibreOffice .ods o Foglio
  Google) negli impegni del calendario (js/calendario.js), nel formato di impegni-pubblicati.json
  (vedi app/LEGGIMI.md, «Formato degli impegni»).

  Il foglio deve essere fatto come quello del 2026/27 (foglio «Piano 26-27»):
  - si usa il foglio il cui nome inizia con «Piano» (non «secondaria» né «calendario regionale»);
  - in alto una riga con le intestazioni ISTITUTO, INFANZIA, PRIMARIA, SECONDARIA: ognuna è una colonna di impegni;
  - una riga con GIORNO e ORARIO: le colonne della data e dell'ora (se manca, sono le due prima di ISTITUTO);
  - poi una riga per impegno. Se la cella della data è vuota, l'impegno è nello STESSO GIORNO della riga sopra
    (nel foglio le date si scrivono una volta sola per giorno). Ci si ferma alla firma del Dirigente.
  Le righe che non si capiscono non bloccano niente: finiscono nell'elenco «scartate» per controllarle a mano.

  Privacy (il calendario lo vedono anche gli studenti): dei GLO resta solo il plesso, mai l'elenco delle classi.
  Usato da: calendario.js (anteprima e pubblicazione). Legge i fogli con Foglio.leggiTabelle (sostituzioni/js/foglio.js).
*/
const PianoAttivita = (() => {
  const SCUOLE = ['istituto', 'infanzia', 'primaria', 'secondaria'];
  // Sigle dei plessi e abbreviazioni usate nel piano (si vedono in fondo al calendario)
  const SIGLE = {
    AL: 'Almese', ML: 'Milanere', RV: 'Rivera', RB: 'Rubiana', RU: 'Rubiana', Rub: 'Rubiana', VD: 'Villar Dora',
    CdC: 'Consiglio di classe', GLO: "Gruppo di lavoro operativo per l'inclusione"
  };
  const NOMI_SCUOLE = { istituto: 'Istituto', infanzia: 'Infanzia', primaria: 'Primaria', secondaria: 'Secondaria' };

  // Testo della cella senza accenti, minuscolo e con gli spazi in ordine (per riconoscere le intestazioni)
  const semplice = v => String(v === undefined || v === null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
  // Testo della cella così come si vede, su una riga sola
  const testo = v => String(v === undefined || v === null ? '' : v).replace(/\s+/g, ' ').trim();
  const due = n => String(n).padStart(2, '0');

  /*
    Data di una cella → "2026-09-01", oppure '' se la cella non è una data.
    - numero: data di Excel (giorni dal 30/12/1899), come nei file .xlsx;
    - testo: "Tuesday 01/09/2026", "1/12/2026", "13/01/27" (giorno/mese/anno) oppure "2026-09-01".
  */
  function data(v) {
    if (typeof v === 'number' && v > 30000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return `${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}-${due(d.getUTCDate())}`;
    }
    const t = testo(v);
    let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
    if (!m) return '';
    const anno = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const g = Number(m[1]), me = Number(m[2]);
    if (me < 1 || me > 12 || g < 1 || g > 31) return '';
    return `${anno}-${due(me)}-${due(g)}`;
  }

  // Orario "09.00 - 11.00", "15:30- 17.30", "14,30-17,30", "13,30-15" → { inizio: "09:00", fine: "11:00" }
  // Excel può anche scrivere un'ora come frazione del giorno (0,375 = 9:00): diventa solo l'inizio
  function orario(v) {
    if (typeof v === 'number' && v > 0 && v < 1) {
      const min = Math.round(v * 1440);
      return { inizio: `${due(Math.floor(min / 60))}:${due(min % 60)}`, fine: '' };
    }
    const m = testo(v).match(/^(\d{1,2})[.:,](\d{2})\s*-\s*(\d{1,2})(?:[.:,](\d{2}))?/);
    return m ? { inizio: `${due(m[1])}:${m[2]}`, fine: `${due(m[3])}:${m[4] || '00'}` } : null;
  }

  // GLO: si tolgono le classi ("GLO iniziali VD 2^E-4^E-4^F" → "GLO iniziali VD", "… ML 3^C, RB 5^D" → "… ML, RB")
  function puliziaGlo(t) {
    t = t.replace(/_/g, ' ').replace(/\(con le \+2\)/i, '')
      .replace(/\b\d\s*\^\s*[A-Z]?\b|\b\d\^/g, '')
      .replace(/(\s*[,-]\s*)+/g, ' ').replace(/\s+/g, ' ').trim();
    // le sigle dei plessi rimaste in fila si separano con la virgola: "GLO iniziali ML RB RV" → "GLO iniziali ML, RB, RV"
    t = t.replace(/((?:\b[A-Z]{2}\b ?){2,})$/, gruppo => gruppo.trim().split(' ').join(', '));
    return t.replace(/^GLO (INIZIALI|INTERMEDI|FINALI)\b/, (x, fase) => 'GLO ' + fase.toLowerCase());
  }

  // Titolo pulito: errori di battitura frequenti, GLO senza classi, prima lettera maiuscola
  function titolo(t) {
    t = testo(t).replace(/Programazione/g, 'Programmazione').replace(/–/g, '-');
    if (/^glo/i.test(t)) t = puliziaGlo(t);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Il foglio da leggere: quello che si chiama «Piano …» (es. «Piano 26-27»), altrimenti il primo
  function sceltaFoglio(fogli) {
    return fogli.find(f => /^piano\b/i.test(testo(f.nome))) || fogli[0];
  }

  /*
    Punto d'ingresso. fogli = risultato di Foglio.leggiTabelle; nomeFile = nome del file (per la fonte).
    Restituisce { anno, fonte, avviso, sigle, scuole, impegni, foglio, scartate: [{ riga, motivo, testo }] }
    oppure lancia un errore se il foglio non ha la forma attesa.
  */
  function interpreta(fogli, nomeFile) {
    const foglio = sceltaFoglio(fogli || []);
    if (!foglio) throw new Error('il file non contiene fogli');
    const righe = foglio.righe || [];

    // 1. Le colonne: la riga con ISTITUTO / INFANZIA / PRIMARIA / SECONDARIA (nelle prime 20 righe)
    const col = {};
    let rigaScuole = -1;
    for (let r = 0; r < Math.min(20, righe.length) && rigaScuole < 0; r++) {
      const trovate = {};
      (righe[r] || []).forEach((v, c) => { const s = semplice(v); if (SCUOLE.includes(s) && !(s in trovate)) trovate[s] = c; });
      if (Object.keys(trovate).length >= 3) { Object.assign(col, trovate); rigaScuole = r; }
    }
    if (rigaScuole < 0) throw new Error(`nel foglio «${foglio.nome}» non trovo la riga con ISTITUTO, INFANZIA, PRIMARIA, SECONDARIA`);
    // colonne della data e dell'ora: la riga con «GIORNO» e «ORARIO», subito sotto (o le due colonne prima di ISTITUTO)
    let inizioDati = rigaScuole + 1;
    let colGiorno = -1, colOrario = -1;
    for (let r = Math.max(0, rigaScuole - 2); r < Math.min(rigaScuole + 3, righe.length); r++) {
      (righe[r] || []).forEach((v, c) => {
        const s = semplice(v);
        if (colGiorno < 0 && s.startsWith('giorno')) { colGiorno = c; inizioDati = Math.max(inizioDati, r + 1); }
        if (colOrario < 0 && s === 'orario') { colOrario = c; inizioDati = Math.max(inizioDati, r + 1); }
      });
    }
    const primaScuola = Math.min(...Object.values(col));
    if (colGiorno < 0) colGiorno = primaScuola - 2;
    if (colOrario < 0) colOrario = primaScuola - 1;

    // 2. Titolo (prima riga) e avviso sulle date che possono cambiare (righe in alto)
    const inAlto = righe.slice(0, rigaScuole).flat().map(testo).filter(Boolean);
    const intestazione = inAlto.find(t => /piano/i.test(t)) || '';
    const avviso = inAlto.find(t => /possono essere modificat/i.test(t)) || '';

    // 3. Gli impegni, riga per riga
    const impegni = [], scartate = [];
    let giorno = '';
    for (let r = inizioDati; r < righe.length; r++) {
      const riga = righe[r] || [];
      const tutta = riga.map(testo).join(' ');
      if (/dirigente scolastico/i.test(tutta)) break;   // la firma in fondo: fine del piano
      const propria = data(riga[colGiorno]);
      if (propria) giorno = propria;
      else if (testo(riga[colGiorno]) && typeof riga[colGiorno] !== 'number') {
        scartate.push({ riga: r + 1, motivo: 'data non riconosciuta (uso quella della riga sopra)', testo: testo(riga[colGiorno]) });
      }
      const ora = orario(riga[colOrario]), oraTesto = testo(riga[colOrario]);
      for (const scuola of SCUOLE) {
        if (!(scuola in col)) continue;
        const grezzo = testo(riga[col[scuola]]);
        if (!grezzo) continue;
        if (/data libera|^da definire$/i.test(grezzo)) { scartate.push({ riga: r + 1, motivo: 'senza una data precisa', testo: grezzo }); continue; }
        if (!giorno) { scartate.push({ riga: r + 1, motivo: 'manca la data', testo: grezzo }); continue; }
        // Riga che continua la precedente (testo minuscolo, senza data e senza ora): diventa la nota dell'impegno sopra
        const ultimo = impegni[impegni.length - 1];
        if (!propria && !oraTesto && /^[a-zà-ù]/.test(grezzo) && ultimo && ultimo.data === giorno && ultimo.scuola === scuola && !ultimo.inizio) {
          ultimo.nota = (ultimo.nota ? ultimo.nota + ' ' : '') + grezzo.charAt(0).toUpperCase() + grezzo.slice(1);
          continue;
        }
        const t = titolo(grezzo);
        const e = { data: giorno, scuola, titolo: t };
        if (ora) {
          e.inizio = ora.inizio;
          if (ora.fine) e.fine = ora.fine;
          if (oraTesto.includes('/')) e.nota = 'Fine alle ' + oraTesto.split('/').pop().trim();
        } else if (oraTesto) e.nota = oraTesto.replace(/\bPrim\b/, 'primaria');
        if (/con le \+2/i.test(grezzo)) e.nota = 'Con le +2';
        // stesso impegno scritto due volte (per esempio il Collegio Docenti sia in «Istituto» sia in «Secondaria»)
        if (impegni.some(x => x.data === giorno && (x.inizio || '') === (e.inizio || '') && x.titolo.toLowerCase() === t.toLowerCase())) continue;
        impegni.push(e);
      }
    }
    if (!impegni.length) throw new Error(`nel foglio «${foglio.nome}» non ho trovato nessun impegno con una data`);
    impegni.sort((a, b) => a.data.localeCompare(b.data) || (a.inizio || '').localeCompare(b.inizio || ''));

    const primo = impegni[0].data, ultimo = impegni[impegni.length - 1].data;
    const anno = `${primo.slice(0, 4)}/${ultimo.slice(2, 4)}`;
    return {
      anno,
      fonte: `${intestazione || 'Piano annuale delle attività'} (file «${nomeFile}», foglio «${testo(foglio.nome)}»)`,
      avviso,
      sigle: SIGLE,
      scuole: NOMI_SCUOLE,
      impegni,
      foglio: testo(foglio.nome),
      scartate
    };
  }

  return { interpreta, data, orario, titolo };
})();

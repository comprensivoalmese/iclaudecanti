/*
  sintesi.js – «Orario di sintesi» di Orario Facile: il quadro orario per docente in UNA pagina A4 orizzontale,
  come quello che la scuola stampava per ogni piano e per la segreteria (facsimile «Orario definitivo … color»).

  Una riga per docente (nome anche a destra, per leggerlo meglio), per ogni giorno le ore, in ogni casella la classe.
  Colori della legenda (gli stessi del facsimile):
    Potenziamento · Alternativa · Mensa · Compresenza · Ricevimento parenti · Cattedra inclusiva (sostegno) · Disponibilità supplenze.
  Le compresenze arrivano dalle celle «+» di Orario Facile e dal Foglio Compresenze (scheda 8, se è stata aperta, oppure
  l'ultima copia salvata su questo dispositivo). Il sostegno si stampa solo se la scheda 8 l'ha letto e lo si sceglie.
  I nomi veri compaiono solo se sono stati caricati con «👁 Nomi»: la stampa resta sul computer, non va su GitHub.

  Due tasti (scheda 7 «Orario» e scheda «Esporta»): «Stampa / PDF» (nella finestra di stampa si può scegliere
  «Salva come PDF») e «Scarica per Excel» (un file .xls che mantiene i colori).
*/
const Sintesi = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // i colori del facsimile
  const CATEGORIE = {
    potenziamento: { nome: 'Potenziamento', colore: '#81D41A' },
    alternativa: { nome: 'Alternativa', colore: '#FFBF00' },
    mensa: { nome: 'Mensa', colore: '#EC9BA4' },
    compresenza: { nome: 'Compresenza', colore: '#B4C7DC' },
    ricevimento: { nome: 'Ricevimento parenti', colore: '#BF819E' },
    inclusiva: { nome: 'Cattedra inclusiva', colore: '#B7B3CA' },
    disponibilita: { nome: 'Disponibilità supplenze', colore: '#FFFF00' }
  };
  // dal testo dell'attività/tipo alla categoria di colore
  function categoria(testo) {
    const t = String(testo || '').toLowerCase();
    if (/potenz|\bl2\b/.test(t)) return 'potenziamento';
    if (/altern/.test(t)) return 'alternativa';
    if (/^sos|sosteg|inclusiv/.test(t)) return 'inclusiva';
    if (/riceviment/.test(t)) return 'ricevimento';
    if (/disponib/.test(t)) return 'disponibilita';
    if (/mensa|^men$/.test(t)) return 'mensa';
    return 'compresenza';
  }

  /*
    Prepara i dati: per ogni docente, per ogni giorno e ora, le classi (con la categoria).
    conSostegno: se includere le ore di sostegno lette dalla scheda 8.
  */
  function prepara(conSostegno) {
    const T = S.oreM + S.oreP;
    const perDoc = new Map(S.docenti.map(t => [t.id, {}]));
    const perCodice = new Map(S.docenti.map(t => [String(t.nome).trim().toUpperCase(), t.id]));
    const perClasse = new Map(S.classi.map(c => [String(c.nome).trim().toUpperCase(), c]));
    const metti = (doc, g, s, classe, cat) => {
      const d = perDoc.get(doc); if (!d) return;
      const k = g + '|' + s; (d[k] = d[k] || []).push({ classe, cat });
    };
    const attiva = (c, g, s) => { const cfg = c.g && c.g[g]; return !cfg || (s >= S.oreM ? (s - S.oreM) < (cfg.p || 0) : s < (cfg.m || 0)); };
    // colonne: le ore del mattino sempre, quelle del pomeriggio solo nei giorni in cui qualche classe le ha
    const colonne = S.giorni.map(g => ({ g, ore: [...Array(T).keys()].filter(s => s < S.oreM || S.classi.some(c => attiva(c, g, s))) }));
    // lezioni e compresenze di Orario Facile
    S.classi.forEach(c => S.giorni.forEach(g => ((S.orario[c.id] || {})[g] || []).forEach((v, s) => {
      if (!v || !v.doc || !attiva(c, g, s)) return;
      const d = S.discipline.find(x => x.id === v.dis);
      metti(v.doc, g, s, c.nome, d && /^men/i.test(d.sigla) ? 'mensa' : '');
      (v.co || []).forEach(x => { const cat = categoria(x.att); if (cat !== 'inclusiva' || conSostegno) metti(x.doc, g, s, c.nome, cat); });
    })));
    // compresenze del Foglio Compresenze (scheda 8 aperta, altrimenti l'ultima copia sul dispositivo)
    const foglio = typeof SchedaCompresenze !== 'undefined' && SchedaCompresenze.oreCaricate ? SchedaCompresenze.oreCaricate() : null;
    const righe = foglio ? foglio.righe : (typeof Compresenze !== 'undefined' && Compresenze.elenco ? Compresenze.elenco() : []);
    const sostegno = conSostegno && foglio ? foglio.sostegno : [];
    righe.concat(sostegno).forEach(x => {
      const doc = perCodice.get(String(x.codice || '').toUpperCase()), c = perClasse.get(String(x.classe || '').trim().toUpperCase());
      const g = S.giorni.find(y => y === x.giorno), s = Number(x.ora) - 1;
      const cat = categoria(x.tipo);
      // ore senza classe (ricevimento parenti, disponibilità supplenze): nella casella «R» o «D», come nel facsimile
      if (!x.classe && doc && g && s >= 0 && (cat === 'ricevimento' || cat === 'disponibilita')) { metti(doc, g, s, cat === 'ricevimento' ? 'R' : 'D', cat); return; }
      if (!doc || !c || !g || !(s >= 0)) return;
      if (cat === 'inclusiva' && !conSostegno) return;
      const d = perDoc.get(doc)[g + '|' + s];
      if (d && d.some(y => y.classe === c.nome)) return;   // già scritta in Orario Facile
      metti(doc, g, s, c.nome, cat);
    });
    // ordine: per materia principale (quella con più ore nelle cattedre, nell'ordine della scheda Discipline), poi per nome
    const ordineDis = new Map(S.discipline.map((d, i) => [d.id, i]));
    const principale = t => {
      const ore = new Map(); (t.cattedre || []).forEach(k => ore.set(k.di, (ore.get(k.di) || 0) + (k.ore || 0)));
      let meglio = null, max = -1; ore.forEach((n, di) => { if (n > max) { max = n; meglio = di; } });
      return meglio == null ? 999 : ordineDis.get(meglio);
    };
    const nome = t => (typeof nomeVero === 'function' && nomeVero(t.nome) ? (nomeVero(t.nome).breve || nomeVero(t.nome).completo) : t.nome);
    const docenti = S.docenti.slice().sort((a, b) => principale(a) - principale(b) || nome(a).localeCompare(nome(b), 'it', { numeric: true }));
    const usate = new Set(); docenti.forEach(t => Object.values(perDoc.get(t.id)).forEach(l => l.forEach(x => x.cat && usate.add(x.cat))));
    return { colonne, docenti, perDoc, nome, usate };
  }

  // La tabella (la stessa per la stampa e per Excel); stili scritti nelle celle così Excel li mantiene
  function tabella(dati) {
    const { colonne, docenti, perDoc, nome, usate } = dati;
    const bordo = 'border:1px solid #777;';
    const sep = `<td style="background:#B2B2B2;width:3px;padding:0;${bordo}"></td>`;
    let h = '<table class="sintesi" style="border-collapse:collapse;font-family:Arial,sans-serif">';
    h += `<thead><tr><th rowspan="2" style="${bordo}background:#eee;text-align:left">Docente</th>`;
    colonne.forEach((c, i) => { h += (i ? `<th rowspan="2" style="background:#B2B2B2;padding:0;${bordo}"></th>` : '') + `<th colspan="${c.ore.length}" style="${bordo}background:#eee">${esc(c.g.toUpperCase())}</th>`; });
    h += `<th rowspan="2" style="${bordo}background:#eee;text-align:left">Docente</th></tr><tr>`;
    colonne.forEach(c => c.ore.forEach(s => { h += `<th style="${bordo}background:${s >= S.oreM ? '#FFFFD7' : '#eee'}">${s + 1}</th>`; }));
    h += '</tr></thead><tbody>';
    docenti.forEach((t, r) => {
      const n = esc(nome(t)), fondo = r % 2 ? '#F2F2F2' : '#FFFFFF';
      h += `<tr><th style="${bordo}background:${fondo};text-align:left;white-space:nowrap">${n}</th>`;
      colonne.forEach((c, i) => {
        if (i) h += sep;
        c.ore.forEach(s => {
          const l = perDoc.get(t.id)[c.g + '|' + s] || [];
          const cat = (l.find(x => x.cat) || {}).cat;
          const colore = cat ? CATEGORIE[cat].colore : fondo;
          h += `<td style="${bordo}background:${colore};text-align:center">${esc(l.map(x => x.classe).join('/'))}</td>`;
        });
      });
      h += `<th style="${bordo}background:${fondo};text-align:left;white-space:nowrap">${n}</th></tr>`;
    });
    h += '</tbody></table>';
    // legenda (solo i colori usati; la mensa e il potenziamento ci sono quasi sempre)
    const voci = Object.keys(CATEGORIE).filter(k => usate.has(k));
    if (voci.length) h += '<p class="legenda" style="font-family:Arial,sans-serif"><b>Legenda</b> ' + voci.map(k =>
      `<span style="display:inline-block;width:14px;height:10px;background:${CATEGORIE[k].colore};border:1px solid #777;vertical-align:middle"></span> ${esc(CATEGORIE[k].nome)}`).join(' &nbsp; ') + '</p>';
    return h;
  }

  const titolo = () => `ORARIO ${esc((S.meta.anno || '').replace(/\//g, ' - '))}`.trim();
  const sottotitolo = () => esc(S.meta.nome || '') + ' · aggiornato al ' + new Date().toLocaleDateString('it-IT');

  // Stampa: una pagina A4 orizzontale, il testo si rimpicciolisce per starci (anche con 40-50 docenti)
  function pagina(conSostegno) {
    const dati = prepara(conSostegno);
    const righe = dati.docenti.length + 3;
    const pt = Math.max(5, Math.min(9, Math.floor(520 / righe * 10) / 10));   // circa 180 mm di altezza utile
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${titolo()}</title><style>
      @page { size: A4 landscape; margin: 7mm; }
      body { margin: 0; font-family: Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      h1 { font-size: 13pt; margin: 0 0 1mm; text-align: center; } .sotto { font-size: 7pt; text-align: center; margin: 0 0 2mm; color: #444; }
      table.sintesi { width: 100%; table-layout: auto; font-size: ${pt}pt; }
      table.sintesi th, table.sintesi td { padding: 0 1px; line-height: 1.15; }
      .legenda { font-size: 7pt; margin: 2mm 0 0; }
    </style></head><body><h1>${titolo()}</h1><p class="sotto">${sottotitolo()}</p>${tabella(dati)}</body></html>`;
    return html;
  }
  function stampa(conSostegno) {
    const html = pagina(conSostegno);
    // la stampa passa da una cornice nascosta: niente finestre nuove (che il browser potrebbe bloccare)
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.append(f);
    f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
    setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }, 300);
  }

  // Scarica per Excel: una pagina HTML con estensione .xls (Excel la apre con i colori; potrebbe chiedere conferma)
  async function scaricaExcel(conSostegno) {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">` +
      `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Orario di sintesi</x:Name><x:WorksheetOptions>` +
      `<x:Print><x:ValidPrinterInfo/><x:PaperSizeIndex>9</x:PaperSizeIndex></x:Print><x:PageSetup><x:Layout x:Orientation="Landscape"/></x:PageSetup>` +
      `<x:FitToPage/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
      `<style>td,th{font-size:9pt;mso-number-format:"\\@"}</style></head><body><h2>${titolo()}</h2><p>${sottotitolo()}</p>${tabella(prepara(conSostegno))}</body></html>`;
    const nome = 'orario di sintesi ' + (S.meta.anno || '').replace(/\D+/g, '-') + '.xls';
    if (!(await scarica(nome, '\uFEFF' + html, 'application/vnd.ms-excel'))) mostraTesto('Orario di sintesi', html, nome, 'application/vnd.ms-excel');
  }

  // Finestra di scelta (da un tasto di Orario Facile): stampa o Excel, con o senza sostegno
  function chiedi() {
    const puoSostegno = typeof SchedaCompresenze !== 'undefined' && SchedaCompresenze.oreCaricate && SchedaCompresenze.oreCaricate() &&
      SchedaCompresenze.oreCaricate().sostegno.length > 0;
    apriModal(`<h3>Orario di sintesi</h3>
      <p class="hint">Il quadro orario per docente in una pagina A4 orizzontale, con i colori della legenda (potenziamento, Alternativa,
        mensa, compresenze…): da stampare per ogni piano e per la segreteria. ${typeof NOMI !== 'undefined' && NOMI ? '' : '<b>Per avere i nomi al posto dei codici premi prima «👁 Nomi».</b>'}</p>
      <label class="row" style="gap:6px;margin:8px 0"><input type="checkbox" id="sinSost"${puoSostegno ? '' : ' disabled'}> Includi le ore di sostegno (cattedra inclusiva)
        ${puoSostegno ? '' : '<span class="hint">– per includerle apri prima la scheda 8 Compresenze</span>'}</label>
      <div class="foot"><button class="btn" data-close="1">Annulla</button>
        <button class="btn" id="sinExcel">Scarica per Excel</button><button class="btn" id="sinStampa">🖨 Stampa / PDF</button></div>`,
      box => {
        const sost = () => !!$('#sinSost', box).checked;
        $('#sinStampa', box).addEventListener('click', () => { const s = sost(); chiudiModal(); stampa(s); });
        $('#sinExcel', box).addEventListener('click', () => { const s = sost(); chiudiModal(); scaricaExcel(s); });
      });
  }

  return { chiedi, stampa, scaricaExcel, prepara, pagina };
})();

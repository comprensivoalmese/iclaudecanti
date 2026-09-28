/*
  foglio.js – legge il foglio del conteggio ore (.ods, .xlsx oppure .csv) direttamente nel browser.
  Il file NON viene mai inviato a nessun server: resta sul computer di chi lo carica.

  Il foglio deve avere una riga di intestazione con "COGNOME", "NOME", le settimane
  numerate (1, 2, 3 …) e, se c'è, "TOTALE" (come il foglio "Prospetto" della scuola).
  Numeri negativi = ore a debito, numeri positivi = ore a credito.
*/
const Foglio = (() => {

  // ---------- 1. Aprire i file compressi (.ods e .xlsx) ----------
  // .ods e .xlsx sono in realtà archivi zip pieni di file XML: qui li "apriamo".
  async function apriZip(buffer) {
    const v = new DataView(buffer);
    const dec = new TextDecoder();

    // In fondo al file c'è l'indice dell'archivio: lo cerchiamo partendo dalla fine
    let fine = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (v.getUint32(i, true) === 0x06054b50) { fine = i; break; }
    }
    if (fine < 0) throw new Error('Il file non sembra un foglio di calcolo valido (.ods o .xlsx).');

    // Leggiamo l'indice: per ogni file interno ci segniamo dove si trova e come è compresso
    const quanti = v.getUint16(fine + 10, true);
    let p = v.getUint32(fine + 16, true);
    const voci = new Map();
    for (let k = 0; k < quanti; k++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const metodo = v.getUint16(p + 10, true);
      const dimensione = v.getUint32(p + 20, true);
      const lNome = v.getUint16(p + 28, true);
      const lExtra = v.getUint16(p + 30, true);
      const lCommento = v.getUint16(p + 32, true);
      const posizione = v.getUint32(p + 42, true);
      const nome = dec.decode(new Uint8Array(buffer, p + 46, lNome));
      voci.set(nome, { metodo, dimensione, posizione });
      p += 46 + lNome + lExtra + lCommento;
    }

    // Restituisce il contenuto (testo) di un file interno, decomprimendolo se serve
    async function testo(nome) {
      const e = voci.get(nome);
      if (!e) return null;
      const inizio = e.posizione + 30 + v.getUint16(e.posizione + 26, true) + v.getUint16(e.posizione + 28, true);
      const dati = new Uint8Array(buffer, inizio, e.dimensione);
      if (e.metodo === 0) return dec.decode(dati);             // non compresso
      if (e.metodo !== 8) throw new Error('Il file usa un tipo di compressione che non so leggere.');
      if (typeof DecompressionStream === 'undefined') {
        throw new Error('Questo browser è troppo vecchio per leggere il file: aggiornalo oppure salva il foglio come .csv.');
      }
      const flusso = new Blob([dati]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(flusso).text();
    }

    return { testo, contiene: nome => voci.has(nome) };
  }

  const xml = testo => new DOMParser().parseFromString(testo, 'application/xml');

  // ---------- 2. File .ods (LibreOffice / OpenOffice) ----------
  const NS_TABELLA = 'urn:oasis:names:tc:opendocument:xmlns:table:1.0';
  const NS_OFFICE = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
  const NS_TESTO = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';

  // Valore di una cella: un numero se è numerica, altrimenti il testo che si vede
  function valoreCellaOds(cella) {
    const tipo = cella.getAttributeNS(NS_OFFICE, 'value-type');
    if (tipo === 'float' || tipo === 'percentage' || tipo === 'currency') {
      return Number(cella.getAttributeNS(NS_OFFICE, 'value'));
    }
    return [...cella.getElementsByTagNameNS(NS_TESTO, 'p')].map(p => p.textContent).join('\n');
  }

  function leggiOds(testo) {
    const doc = xml(testo);
    return [...doc.getElementsByTagNameNS(NS_TABELLA, 'table')].map(tabella => {
      const righe = [];
      for (const r of tabella.getElementsByTagNameNS(NS_TABELLA, 'table-row')) {
        const riga = [];
        for (const cella of r.children) {
          if (cella.localName !== 'table-cell' && cella.localName !== 'covered-table-cell') continue;
          // Le celle uguali consecutive sono scritte una volta sola con "ripetuta N volte"
          const ripeti = Math.min(Number(cella.getAttributeNS(NS_TABELLA, 'number-columns-repeated')) || 1, 200);
          const valore = valoreCellaOds(cella);
          for (let i = 0; i < ripeti; i++) riga.push(valore);
        }
        while (riga.length && riga[riga.length - 1] === '') riga.pop();
        // Anche le righe possono essere "ripetute": le righe vuote le contiamo una volta sola
        const ripetiRiga = riga.length ? Math.min(Number(r.getAttributeNS(NS_TABELLA, 'number-rows-repeated')) || 1, 50) : 1;
        for (let i = 0; i < ripetiRiga; i++) righe.push(riga.slice());
      }
      return { nome: tabella.getAttributeNS(NS_TABELLA, 'name'), righe };
    });
  }

  // ---------- 3. File .xlsx (Excel / Fogli Google) ----------
  // "D5" -> colonna 3 (A = 0)
  function numeroColonna(riferimento) {
    let n = 0;
    for (const lettera of riferimento.replace(/[0-9]/g, '')) n = n * 26 + (lettera.charCodeAt(0) - 64);
    return n - 1;
  }

  async function leggiXlsx(zip) {
    // I testi delle celle sono raccolti tutti in un file a parte (sharedStrings)
    const testiComuni = [];
    const ss = await zip.testo('xl/sharedStrings.xml');
    if (ss) {
      for (const si of xml(ss).getElementsByTagName('si')) {
        testiComuni.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
      }
    }
    // Elenco dei fogli con il nome e il file che li contiene
    const cartella = xml(await zip.testo('xl/workbook.xml'));
    const collegamenti = xml(await zip.testo('xl/_rels/workbook.xml.rels') || '<r/>');
    const percorsi = {};
    for (const rel of collegamenti.getElementsByTagName('Relationship')) {
      const destinazione = rel.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, '');
      percorsi[rel.getAttribute('Id')] = 'xl/' + destinazione;
    }
    const fogli = [];
    for (const f of cartella.getElementsByTagName('sheet')) {
      const percorso = percorsi[f.getAttribute('r:id')];
      const contenuto = percorso && await zip.testo(percorso);
      if (!contenuto) continue;
      const righe = [];
      for (const r of xml(contenuto).getElementsByTagName('row')) {
        const numeroRiga = Number(r.getAttribute('r')) - 1;
        if (numeroRiga > 5000) break;
        const riga = [];
        for (const c of r.getElementsByTagName('c')) {
          const tipo = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0];
          let valore = '';
          if (tipo === 's') valore = v ? testiComuni[Number(v.textContent)] || '' : '';
          else if (tipo === 'inlineStr') valore = [...c.getElementsByTagName('t')].map(t => t.textContent).join('');
          else if (tipo === 'str' || tipo === 'b') valore = v ? v.textContent : '';
          else if (tipo === 'e') valore = '';
          else if (v) valore = Number(v.textContent);
          riga[numeroColonna(c.getAttribute('r') || '')] = valore;
        }
        righe[numeroRiga] = Array.from(riga, x => x === undefined ? '' : x);
      }
      fogli.push({ nome: f.getAttribute('name'), righe: Array.from(righe, x => x || []) });
    }
    return fogli;
  }

  // ---------- 4. File .csv (testo separato da ; o ,) ----------
  function leggiCsv(testo) {
    if (testo.charCodeAt(0) === 0xFEFF) testo = testo.slice(1);   // toglie il BOM iniziale
    const primaRiga = testo.split(/\r?\n/)[0];
    const conta = s => primaRiga.split(s).length;
    const separatore = [';', ',', '\t'].sort((a, b) => conta(b) - conta(a))[0];
    const righe = [];
    let riga = [], cella = '', traVirgolette = false;
    for (let i = 0; i < testo.length; i++) {
      const ch = testo[i];
      if (traVirgolette) {
        if (ch === '"' && testo[i + 1] === '"') { cella += '"'; i++; }
        else if (ch === '"') traVirgolette = false;
        else cella += ch;
      } else if (ch === '"') traVirgolette = true;
      else if (ch === separatore) { riga.push(cella); cella = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && testo[i + 1] === '\n') i++;
        riga.push(cella); righe.push(riga); riga = []; cella = '';
      } else cella += ch;
    }
    if (cella || riga.length) { riga.push(cella); righe.push(riga); }
    return [{ nome: 'CSV', righe }];
  }

  // ---------- 5. Capire il contenuto: docenti e ore ----------
  const semplifica = s => String(s === undefined || s === null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Trasforma una cella in numero: accetta anche "-3", "−3" e "2,5"; restituisce null se non è un numero
  function numero(x) {
    if (typeof x === 'number') return isFinite(x) ? x : null;
    const s = String(x === undefined || x === null ? '' : x).trim().replace('−', '-').replace(',', '.');
    if (s === '' || isNaN(s)) return null;
    return Number(s);
  }

  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
    'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  // Cerca una nota come "Settimana 1 dal 9 all'11 settembre 2026" e restituisce
  // il lunedì di quella settimana (es. "2026-09-07"), oppure null
  function cercaInizio(fogli) {
    const regola = new RegExp('settimana\\s*1\\s+dal\\s+(\\d{1,2})[^\\d]*(?:\\d{1,2})?\\s*(' + MESI.join('|') + ')\\s+(\\d{4})', 'i');
    for (const f of fogli) {
      for (const riga of f.righe) {
        for (const cella of riga) {
          const m = regola.exec(String(cella));
          if (!m) continue;
          const giorno = new Date(Date.UTC(Number(m[3]), MESI.indexOf(m[2].toLowerCase()), Number(m[1])));
          // torna indietro fino al lunedì (getUTCDay: 0 = domenica, 1 = lunedì…)
          giorno.setUTCDate(giorno.getUTCDate() - ((giorno.getUTCDay() + 6) % 7));
          return giorno.toISOString().slice(0, 10);
        }
      }
    }
    return null;
  }

  function interpreta(fogli, nomeFile) {
    // Cerchiamo il foglio con la riga "COGNOME / NOME" (preferendo quello chiamato "Prospetto")
    const ordinati = fogli.slice().sort((a, b) =>
      (semplifica(b.nome) === 'prospetto') - (semplifica(a.nome) === 'prospetto'));
    let trovato = null;
    for (const f of ordinati) {
      for (let i = 0; i < Math.min(f.righe.length, 30) && !trovato; i++) {
        const r = f.righe[i] || [];
        const cCognome = r.findIndex(x => semplifica(x) === 'cognome');
        const cNome = r.findIndex(x => semplifica(x) === 'nome');
        if (cCognome >= 0 && cNome >= 0) trovato = { f, i, cCognome, cNome };
      }
      if (trovato) break;
    }
    if (!trovato) {
      throw new Error('Non trovo la riga di intestazione con "COGNOME" e "NOME". ' +
        'Controlla che il foglio abbia la stessa struttura del modello (vedi il facsimile).');
    }

    const { f, i, cCognome, cNome } = trovato;
    const intestazione = f.righe[i];
    const dopoNomi = Math.max(cCognome, cNome);
    // Le colonne delle settimane hanno come titolo un numero (1, 2, 3…)
    const colonneSettimane = [];
    let colonnaTotale = -1;
    const numeriSettimana = riga => {
      const trovate = [];
      (riga || []).forEach((x, c) => {
        const n = numero(x);
        if (c > dopoNomi && n !== null && Number.isInteger(n) && n >= 1 && n <= 60) trovate.push({ c, n });
      });
      return trovate;
    };
    colonneSettimane.push(...numeriSettimana(intestazione));
    intestazione.forEach((x, c) => { if (semplifica(x) === 'totale') colonnaTotale = c; });
    // Se i numeri delle settimane non sono sulla riga di COGNOME / NOME, li cerchiamo nelle righe sopra (es. la riga 1)
    for (let s = i - 1; s >= 0 && !colonneSettimane.length; s--) colonneSettimane.push(...numeriSettimana(f.righe[s]));

    const docenti = [];
    const chiaviUsate = new Set();
    for (let r = i + 1; r < f.righe.length; r++) {
      const riga = f.righe[r] || [];
      if (typeof riga[cCognome] !== 'string') continue;
      const cognome = riga[cCognome].trim();
      const nome = String(riga[cNome] || '').trim();
      if (!cognome) continue;
      const settimane = {};
      let somma = 0;
      colonneSettimane.forEach(({ c, n }) => {
        const v = numero(riga[c]);
        if (v) { settimane[n] = v; somma += v; }
      });
      const totale = colonnaTotale >= 0 ? numero(riga[colonnaTotale]) : null;
      // La "chiave" identifica il docente anche se il foglio viene ricaricato
      let chiave = semplifica(cognome) + '|' + semplifica(nome);
      while (chiaviUsate.has(chiave)) chiave += '+';
      chiaviUsate.add(chiave);
      // riga: posizione nel foglio (0 = prima riga), serve per scrivere le ore nel foglio su Google Drive
      docenti.push({ chiave, cognome, nome, settimane, totale: totale !== null ? totale : somma, riga: r });
    }
    if (!docenti.length) throw new Error('Ho trovato l\'intestazione ma nessun docente sotto.');

    return {
      file: nomeFile,
      foglio: f.nome,
      caricato: new Date().toISOString(),
      inizio: cercaInizio(fogli),
      // numero della settimana -> colonna nel foglio (0 = colonna A), per scrivere le ore su Google Drive
      colonne: Object.fromEntries(colonneSettimane.map(({ c, n }) => [n, c])),
      // colonne di COGNOME e NOME: prima di scrivere su Drive si controlla che la riga sia ancora quella del docente
      colonnaCognome: cCognome,
      colonnaNome: cNome,
      docenti
    };
  }

  // ---------- 6. Punto d'ingresso: riceve il file scelto dall'utente ----------
  async function leggiFile(file) {
    return interpreta(await leggiTabelle(file), file.name);
  }
  // Legge un file .ods / .xlsx / .csv e restituisce i fogli così come sono: [{ nome, righe: [[celle…]…] }]
  // (lo usa anche il modulo «Sciopero / assemblea» per il file delle adesioni, js/scioperi.js)
  async function leggiTabelle(file) {
    const estensione = (file.name.split('.').pop() || '').toLowerCase();
    const buffer = await file.arrayBuffer();
    let fogli;
    if (estensione === 'csv' || estensione === 'txt') {
      let testo;
      // Excel in italiano spesso salva i CSV in "Windows-1252": se non è UTF-8 proviamo quello
      try { testo = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
      catch (e) { testo = new TextDecoder('windows-1252').decode(buffer); }
      fogli = leggiCsv(testo);
    } else if (estensione === 'xls') {
      throw new Error('I file .xls (Excel vecchio) non sono supportati: salvalo come .xlsx, .ods o .csv.');
    } else {
      const zip = await apriZip(buffer);
      if (zip.contiene('content.xml')) fogli = leggiOds(await zip.testo('content.xml'));
      else if (zip.contiene('xl/workbook.xml')) fogli = await leggiXlsx(zip);
      else throw new Error('Formato non riconosciuto: usa un file .ods, .xlsx oppure .csv.');
    }
    return fogli;
  }

  return { leggiFile, leggiTabelle, interpreta, semplifica };
})();

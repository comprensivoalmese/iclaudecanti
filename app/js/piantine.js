/*
  piantine.js – dove si trova ogni aula: le piantine dei piani della scuola con un segnaposto sull'aula.
  Lo usano l'app Luis@i (tocco su un'aula → «📍 Dov'è») e Orario Facile (scheda 3 Aule: si segna la posizione).

  Dove stanno i dati (mai su GitHub: sono tavole tecniche dell'edificio):
  - le IMMAGINI dei piani: file su Google Drive (CONFIG.piantine: piano, nome, file = ID del file), condivisi in
    lettura con l'Istituto;
  - la POSIZIONE di ogni aula: Foglio Database, scheda «Aule», colonne D «Piano», E «X (%)», F «Y (%)»: X e Y sono la
    posizione in percentuale della larghezza e dell'altezza dell'immagine, così vanno bene a qualsiasi grandezza.
    Orario Facile scrive solo le colonne A-C di quella scheda (database.js), quindi D-F restano.
  Se il piano di un'aula non è scritto, si ricava dalla prima lettera del codice (S… seminterrato, 1… terreno…),
  confrontandola con CONFIG.piantine[].piano: così funziona anche per altre scuole con altri codici e altri piani.
  Tutto si legge con il permesso Google di chi ha fatto l'accesso (vedi nomi.js); le immagini restano solo in memoria.
*/
const Piantine = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semplice = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const SCHEDA = "'Aule'";
  const TITOLI = ['Piano', 'X (%)', 'Y (%)'];

  const piani = () => (typeof CONFIG !== 'undefined' && CONFIG.piantine) || [];
  const configurato = () => typeof CONFIG !== 'undefined' && !!CONFIG.fileDatabaseOrario && piani().some(p => p.file);
  const pianoInfo = piano => piani().find(p => String(p.piano).toUpperCase() === String(piano || '').toUpperCase());
  // il piano dal codice dell'aula: la prima lettera (o cifra) confrontata con i piani di config.js
  const pianoDaCodice = nome => { const c = String(nome || '').trim().charAt(0).toUpperCase(); const p = pianoInfo(c); return p ? p.piano : ''; };

  let posizioni = null;    // Map nome semplice -> { aula, piano, x, y, riga } (null = non ancora lette)
  let righe = [];          // nomi delle aule nell'ordine della scheda (dalla riga 2)
  const immagini = new Map();   // piano -> Promise dell'indirizzo dell'immagine (in memoria)

  const numero = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? null : Math.max(0, Math.min(100, n)); };
  const url = percorso => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(CONFIG.fileDatabaseOrario) + percorso;

  // Legge dalla scheda «Aule» del Database il piano e la posizione di ogni aula
  async function carica(t) {
    const r = await fetch(url('/values/' + encodeURIComponent(SCHEDA + '!A1:F300')), { cache: 'no-cache', headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error(r.status === 403 ? 'il tuo account non può leggere il Foglio Database' : 'errore ' + r.status + ' da Google');
    const valori = (await r.json()).values || [];
    righe = []; posizioni = new Map();
    valori.slice(1).forEach((v, i) => {
      const nome = String(v[0] || '').trim();
      righe[i] = nome;
      if (!nome) return;
      posizioni.set(semplice(nome), { aula: nome, piano: String(v[3] || '').trim() || pianoDaCodice(nome), x: numero(v[4]), y: numero(v[5]), riga: i + 2 });
    });
    return posizioni;
  }
  // Nell'app: legge le posizioni una volta sola, appena c'è il permesso di Google (true se sono arrivate adesso)
  async function prepara() {
    if (!configurato() || posizioni || typeof NomiDocenti === 'undefined') return false;
    const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
    if (!t) return false;
    try { await carica(t); return true; } catch (e) { return false; }
  }

  const posizione = nome => (posizioni && posizioni.get(semplice(nome))) || null;
  // un'aula si può mostrare se ha piano, X e Y e se di quel piano c'è l'immagine
  const segnata = nome => { const p = posizione(nome); return !!(p && p.x != null && p.y != null && pianoInfo(p.piano) && pianoInfo(p.piano).file); };

  // L'immagine di un piano, scaricata da Drive con il permesso dell'utente (resta solo in memoria)
  function immagine(piano, t) {
    const info = pianoInfo(piano);
    if (!info || !info.file) return Promise.reject(new Error('per questo piano manca l\'immagine (config.js, piantine)'));
    if (!immagini.has(info.piano)) {
      const p = fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(info.file) + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + t } })
        .then(r => { if (!r.ok) throw new Error(r.status === 404 || r.status === 403 ? 'l\'immagine della piantina non si apre con il tuo account' : 'errore ' + r.status); return r.blob(); })
        .then(b => URL.createObjectURL(b));
      p.catch(() => immagini.delete(info.piano));
      immagini.set(info.piano, p);
    }
    return immagini.get(info.piano);
  }

  // Il riquadro con la piantina e i segnaposto: [{ nome, x, y, scelto }]. Il contenitore deve avere position:relative
  function disegnoHtml(indirizzo, segni, alt) {
    return `<div class="piantina"><img src="${esc(indirizzo)}" alt="${esc(alt)}" draggable="false">` +
      segni.filter(s => s.x != null && s.y != null).map(s =>
        `<span class="segno-piantina${s.scelto ? ' scelto' : ''}" style="left:${s.x}%;top:${s.y}%" data-segno="${esc(s.nome)}"><span>${esc(s.nome)}</span></span>`).join('') + '</div>';
  }

  // Nell'app: una finestra con la piantina del piano e l'aula segnata
  let finestra = null;
  async function mostra(nome) {
    const p = posizione(nome), info = p && pianoInfo(p.piano);
    if (!finestra) {
      finestra = document.createElement('dialog');
      finestra.className = 'finestra finestra-piantina';
      finestra.setAttribute('aria-labelledby', 'titoloPiantina');
      finestra.addEventListener('click', e => { if (e.target === finestra || e.target.closest('[data-chiudi-piantina]')) finestra.close(); });
      document.body.append(finestra);
    }
    finestra.innerHTML = `<h2 id="titoloPiantina">📍 Aula ${esc(nome)}${info ? ' · ' + esc(info.nome) : ''}</h2><div class="corpo-piantina"><p>Carico la piantina…</p></div>
      <button type="button" class="pulsante primario" data-chiudi-piantina>Chiudi</button>`;
    if (!finestra.open) finestra.showModal();
    const corpo = finestra.querySelector('.corpo-piantina');
    try {
      if (!p || !info) throw new Error('la posizione di questa aula non è ancora segnata');
      const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
      if (!t) throw new Error('serve il permesso di Google: tocca «👁 Nomi» o riapri l\'app');
      const indirizzo = await immagine(p.piano, t);
      corpo.innerHTML = disegnoHtml(indirizzo, [{ nome, x: p.x, y: p.y, scelto: true }], `Piantina: ${info.nome}, con l'aula ${nome} segnata`);
      const segno = corpo.querySelector('.segno-piantina');
      if (segno) segno.scrollIntoView({ block: 'center', inline: 'center' });
    } catch (e) { corpo.innerHTML = `<p>⚠️ ${esc(e.message)}.</p>`; }
  }

  /*
    Scrive nella scheda «Aule» del Database le colonne D-F (Piano, X, Y) per le aule indicate:
    modifiche = Map nome aula -> { piano, x, y }. Rilegge prima la scheda, così le righe sono quelle giuste.
  */
  async function salva(t, modifiche) {
    await carica(t);
    modifiche.forEach((v, nome) => { const p = posizione(nome); if (p) Object.assign(p, v); });
    const valori = [TITOLI].concat(righe.map(nome => {
      const p = nome && posizione(nome);
      return p ? [p.piano || '', p.x == null ? '' : Math.round(p.x * 10) / 10, p.y == null ? '' : Math.round(p.y * 10) / 10] : ['', '', ''];
    }));
    const r = await fetch(url('/values/' + encodeURIComponent(SCHEDA + '!D1:F' + valori.length) + '?valueInputOption=RAW'), {
      method: 'PUT', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: valori })
    });
    if (!r.ok) throw new Error(r.status === 403 ? 'il tuo account non può modificare il Foglio Database' : 'errore ' + r.status + ' da Google');
  }

  return { configurato, piani, pianoInfo, pianoDaCodice, carica, prepara, posizione, segnata, immagine, disegnoHtml, mostra, salva, semplice };
})();

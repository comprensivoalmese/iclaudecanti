/*
  piantine.js – dove si trova ogni aula: le piantine dei piani della scuola con un segnaposto sull'aula.
  Lo usano l'app Luis@i (tocco su un'aula → «📍 Dov'è») e Orario Facile (scheda 3 Aule: si segna la posizione).

  Dove stanno i dati (mai su GitHub: sono tavole tecniche dell'edificio):
  - le IMMAGINI dei piani: file su Google Drive (CONFIG.piantine: piano, nome, file = ID del file), condivisi in
    lettura con l'Istituto. Vanno bene un'immagine (PNG/JPG: si vede un segnaposto) oppure, meglio, un disegno SVG
    semplificato a rettangoli: le stanze sono <rect class="stanza" data-nome="aula" data-cx="…" data-cy="…">
    (centro in % del disegno) e si possono toccare; le altre superfici (scale, bagni…) hanno class="servizio";
  - la STANZA di un'aula: quella il cui centro è vicino alla posizione dell'aula (in Orario Facile si tocca la stanza
    e la posizione diventa il suo centro);
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
  // Un'aula in un altro edificio: nella colonna «Piano» c'è un testo che non è un piano delle piantine
  // (es. «Edificio mensa», «Campo sportivo»): toccandola si legge solo dove si trova
  const altroEdificio = nome => { const p = posizione(nome); return !!(p && p.piano && !pianoInfo(p.piano)); };
  // un'aula si può mostrare se ha piano, X e Y e se di quel piano c'è l'immagine, oppure se è in un altro edificio
  const segnata = nome => { const p = posizione(nome); return !!(p && ((p.x != null && p.y != null && pianoInfo(p.piano) && pianoInfo(p.piano).file) || altroEdificio(nome))); };

  /*
    Un disegno SVG scaricato da Drive, ripulito: niente script, niente attributi «on…» (onclick…), niente
    collegamenti «javascript:». Così nella pagina entra solo il disegno.
  */
  function svgPulito(testo) {
    const doc = new DOMParser().parseFromString(testo, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('il file della piantina non è un disegno SVG valido');
    svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach(n => n.remove());
    [svg, ...svg.querySelectorAll('*')].forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) n.removeAttribute(a.name);
    }));
    svg.removeAttribute('width'); svg.removeAttribute('height');
    return new XMLSerializer().serializeToString(svg);
  }

  /*
    Il disegno di un piano, scaricato da Drive con il permesso dell'utente (resta solo in memoria).
    Restituisce { url } per un'immagine (PNG, JPG) oppure { svg } per un disegno SVG: nel disegno le stanze
    (rettangoli con class="stanza" e data-cx / data-cy = centro in %) si possono toccare.
  */
  function immagine(piano, t) {
    const info = pianoInfo(piano);
    if (!info || !info.file) return Promise.reject(new Error('per questo piano manca l\'immagine (config.js, piantine)'));
    if (!immagini.has(info.piano)) {
      const p = fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(info.file) + '?alt=media&supportsAllDrives=true', { headers: { Authorization: 'Bearer ' + t } })
        .then(r => { if (!r.ok) throw new Error(r.status === 404 || r.status === 403 ? 'l\'immagine della piantina non si apre con il tuo account' : 'errore ' + r.status); return r.blob(); })
        .then(async b => {
          // SVG: Drive lo manda come image/svg+xml (a volte come testo): lo riconosciamo anche dall'inizio del file
          if (/svg|xml|text/i.test(b.type)) {
            const testo = await b.text();
            if (/<svg[\s>]/i.test(testo)) return { svg: svgPulito(testo) };
          }
          return { url: URL.createObjectURL(b) };
        });
      p.catch(() => immagini.delete(info.piano));
      immagini.set(info.piano, p);
    }
    return immagini.get(info.piano);
  }

  // La stanza del disegno più vicina a un punto (in %): quella che contiene l'aula (entro 4 punti di distanza)
  function stanzaVicina(stanze, x, y) {
    let migliore = null, d = 4;
    stanze.forEach(s => {
      const dd = Math.hypot(parseFloat(s.getAttribute('data-cx')) - x, parseFloat(s.getAttribute('data-cy')) - y);
      if (dd <= d) { d = dd; migliore = s; }
    });
    return migliore;
  }

  // Il disegno SVG con le stanze pronte da toccare: colorate se hanno un'aula, gialla quella scelta
  function svgConStanze(testo, segni, alt) {
    const svg = new DOMParser().parseFromString(testo, 'image/svg+xml').documentElement;
    const stanze = [...svg.querySelectorAll('.stanza[data-cx][data-cy]')];
    stanze.forEach(s => {
      s.setAttribute('tabindex', '0'); s.setAttribute('role', 'button');
      s.setAttribute('aria-label', s.getAttribute('data-nome') || 'stanza');
    });
    segni.filter(s => s.x != null && s.y != null).forEach(s => {
      const st = stanzaVicina(stanze, s.x, s.y); if (!st) return;
      st.classList.add('assegnata'); if (s.scelto) st.classList.add('scelta');
      // se nella stessa stanza ci sono più aule, le elenchiamo tutte
      const gia = st.getAttribute('data-aula');
      st.setAttribute('data-aula', gia && !s.scelto ? gia : s.nome);
      st.setAttribute('aria-label', 'Aula ' + (gia && gia !== s.nome ? gia + ', ' + s.nome : s.nome) + ' (' + (st.getAttribute('data-nome') || 'stanza') + ')');
    });
    svg.setAttribute('role', 'group'); svg.setAttribute('aria-label', alt);
    return new XMLSerializer().serializeToString(svg);
  }

  /*
    Il riquadro con la piantina e i segnaposto: [{ nome, x, y, scelto }].
    sorgente = { url } (immagine) oppure { svg } (disegno con le stanze da toccare), come la dà immagine().
  */
  function disegnoHtml(sorgente, segni, alt) {
    const vett = sorgente && sorgente.svg;
    const disegno = vett ? svgConStanze(sorgente.svg, segni, alt)
      : `<img src="${esc(sorgente && sorgente.url)}" alt="${esc(alt)}" draggable="false">`;
    return `<div class="piantina${vett ? ' piantina-vettoriale' : ''}">${disegno}` +
      segni.filter(s => s.x != null && s.y != null).map(s =>
        `<span class="segno-piantina${s.scelto ? ' scelto' : ''}" style="left:${s.x}%;top:${s.y}%" data-segno="${esc(s.nome)}"><span>${esc(s.nome)}</span></span>`).join('') + '</div>';
  }
  // Le aule segnate su un piano (per mostrarle tutte sulla piantina)
  const aulePiano = piano => posizioni ? [...posizioni.values()].filter(p => String(p.piano).toUpperCase() === String(piano).toUpperCase() && p.x != null && p.y != null) : [];
  // Invio o spazio su una stanza del disegno = tocco (per chi usa la tastiera)
  function tastiera(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('.stanza')) {
      e.preventDefault();
      e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  }

  // Nell'app: una finestra con la piantina del piano e l'aula segnata
  let finestra = null, nomeMostrato = '';
  async function mostra(nome) {
    const p = posizione(nome), info = p && pianoInfo(p.piano);
    if (!finestra) {
      finestra = document.createElement('dialog');
      finestra.className = 'finestra finestra-piantina';
      finestra.setAttribute('aria-labelledby', 'titoloPiantina');
      finestra.addEventListener('click', e => {
        if (e.target === finestra || e.target.closest('[data-chiudi-piantina]')) { finestra.close(); return; }
        // toccando un'altra aula del disegno si vede quella
        const st = e.target.closest && e.target.closest('.stanza.assegnata[data-aula]');
        if (st && st.getAttribute('data-aula') !== nomeMostrato) mostra(st.getAttribute('data-aula'));
      });
      finestra.addEventListener('keydown', tastiera);
      document.body.append(finestra);
    }
    nomeMostrato = nome;
    finestra.innerHTML = `<h2 id="titoloPiantina">📍 Aula ${esc(nome)}${info ? ' · ' + esc(info.nome) : ''}</h2><div class="corpo-piantina"><p>Carico la piantina…</p></div>
      <button type="button" class="pulsante primario" data-chiudi-piantina>Chiudi</button>`;
    if (!finestra.open) finestra.showModal();
    const corpo = finestra.querySelector('.corpo-piantina');
    if (altroEdificio(nome)) {
      corpo.innerHTML = `<p class="altro-edificio">📍 L'aula <b>${esc(nome)}</b> si trova in: <b>${esc(p.piano)}</b>.</p>`;
      return;
    }
    try {
      if (!p || !info) throw new Error('la posizione di questa aula non è ancora segnata');
      const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]);
      if (!t) throw new Error('serve il permesso di Google: tocca «👁 Nomi» o riapri l\'app');
      const sorgente = await immagine(p.piano, t);
      if (nomeMostrato !== nome) return;   // nel frattempo è stata chiesta un'altra aula
      // sul disegno SVG si vedono tutte le aule del piano (si toccano per cambiare); sull'immagine solo quella cercata
      const altre = sorgente.svg ? aulePiano(p.piano).filter(a => semplice(a.aula) !== semplice(nome)).map(a => ({ nome: a.aula, x: a.x, y: a.y })) : [];
      corpo.innerHTML = disegnoHtml(sorgente, altre.concat([{ nome, x: p.x, y: p.y, scelto: true }]), `Piantina: ${info.nome}, con l'aula ${nome} segnata`) +
        (altre.length ? '<p class="nota-piantina">In giallo l\'aula cercata: tocca un\'altra aula colorata per vedere quale è.</p>' : '');
      const segno = corpo.querySelector('.segno-piantina.scelto');
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

  return { configurato, piani, pianoInfo, pianoDaCodice, carica, prepara, posizione, segnata, immagine, disegnoHtml, tastiera, mostra, salva, semplice };
})();

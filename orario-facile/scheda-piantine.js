/*
  scheda-piantine.js – in Orario Facile (scheda 3 Aule, riquadro «Aule sulla piantina»): si segna dove si trova ogni aula.
  Si sceglie il piano, si tocca un'aula nell'elenco e poi la stanza sulla piantina (disegno SVG a rettangoli: l'aula
  va al centro della stanza) oppure il punto dell'immagine (PNG/JPG): il segnaposto si sposta lì.
  «Salva sul Foglio» scrive piano e posizione nella scheda «Aule» del Foglio Database (vedi app/js/piantine.js);
  nell'app, toccando un'aula, compare la piantina con l'aula segnata.
  Le aule compaiono sotto il piano indicato dalla prima lettera del codice (S…, 1…, 2…, 3…); le altre (per esempio
  MENSA o la palestra) si aggiungono a un piano con la tendina «Un'altra aula su questo piano».
  Uso: SchedaPiantine.monta(elemento, { aule: () => ['110ITA4', …], email: () => '…' }).
*/
const SchedaPiantine = (() => {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PERMESSI = () => [NomiDocenti.PERMESSO_DRIVE, 'https://www.googleapis.com/auth/spreadsheets'];
  let box = null, ctx = null;
  let stato = 'collega';          // 'collega' | 'carico' | 'pronto' | 'errore'
  let errore = '', messaggio = '';
  let piano = '';                 // il piano mostrato
  let scelta = '';                // l'aula da posizionare (nome)
  const modifiche = new Map();    // nome aula -> { piano, x, y } non ancora salvate
  const indirizzi = new Map();    // piano -> indirizzo dell'immagine (o errore)

  // piano e posizione di un'aula: quelli appena modificati, altrimenti quelli del Foglio, altrimenti dal codice
  function datiAula(nome) {
    if (modifiche.has(nome)) return modifiche.get(nome);
    const p = Piantine.posizione(nome);
    return p ? { piano: p.piano, x: p.x, y: p.y } : { piano: Piantine.pianoDaCodice(nome), x: null, y: null };
  }
  const aulePiano = pn => ctx.aule().filter(n => String(datiAula(n).piano).toUpperCase() === String(pn).toUpperCase());

  async function collega() {
    stato = 'carico'; disegna();
    try {
      const t = await NomiDocenti.gettone(PERMESSI(), ctx.email());
      await Piantine.carica(t);
      stato = 'pronto';
      await immagine(piano, t);
    } catch (e) { stato = 'errore'; errore = e.message; }
    disegna();
  }
  async function immagine(pn, t) {
    if (indirizzi.has(pn)) return;
    try { indirizzi.set(pn, { sorgente: await Piantine.immagine(pn, t || NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE])) }); }
    catch (e) { indirizzi.set(pn, { errore: e.message }); }
  }

  async function salva() {
    messaggio = 'Salvo sul Foglio Database…'; disegna();
    try {
      await Piantine.salva(await NomiDocenti.gettone(PERMESSI(), ctx.email()), modifiche);
      modifiche.clear(); messaggio = '✓ Posizioni salvate nel Foglio Database (scheda Aule): l\'app le usa da subito.';
    } catch (e) { messaggio = '⚠️ Non salvato: ' + e.message + '.'; }
    disegna();
  }

  function disegna() {
    if (!box) return;
    const infoPiani = Piantine.piani();
    if (!Piantine.configurato()) {
      box.innerHTML = `<p class="hint">Per segnare le aule servono le immagini dei piani su Google Drive (condivise in lettura con l'Istituto) e i loro ID
        in <code>app/js/config.js</code>, voce <code>piantine</code>${infoPiani.length ? ' (piani previsti: ' + esc(infoPiani.map(p => p.nome).join(', ')) + ')' : ''}.</p>`;
      return;
    }
    if (!piano) piano = infoPiani[0].piano;
    if (stato !== 'pronto') {
      box.innerHTML = `<p class="hint">Segna dove si trova ogni aula: nell'app, toccando un'aula, comparirà la piantina del piano con l'aula evidenziata.</p>` +
        (stato === 'errore' ? `<p class="comp-avviso">⚠️ ${esc(errore)}</p>` : '') +
        `<div class="row"><button class="btn" data-pa="collega"${stato === 'carico' ? ' disabled' : ''}>${stato === 'carico' ? 'Carico…' : 'Collega a Google e apri le piantine'}</button></div>`;
      return;
    }
    const aule = aulePiano(piano);
    const altre = ctx.aule().filter(n => !aule.includes(n));
    const img = indirizzi.get(piano);
    const segni = aule.map(n => Object.assign({ nome: n, scelto: n === scelta }, datiAula(n)));
    const fatte = aule.filter(n => datiAula(n).x != null).length;
    box.innerHTML =
      `<div class="seg" role="group" aria-label="Piano">${infoPiani.map(p => `<button type="button" data-pa="piano" data-piano="${esc(p.piano)}" aria-pressed="${p.piano === piano}">${esc(p.nome)}</button>`).join('')}</div>` +
      `<p class="hint" style="margin:8px 0">1) Tocca un'aula qui sotto · 2) tocca ${img && img.sorgente && img.sorgente.svg ? 'la stanza della piantina (le superfici colorate)' : 'il punto della piantina'} dove si trova. ${fatte} di ${aule.length} aule segnate su questo piano.</p>` +
      `<div class="row pa-aule">${aule.map(n => `<button type="button" class="btn" data-pa="aula" data-aula="${esc(n)}" aria-pressed="${n === scelta}">${datiAula(n).x != null ? '✓ ' : ''}${esc(n)}</button>`).join('') || '<span class="hint">Nessuna aula su questo piano.</span>'}
        ${altre.length ? `<label class="fl" style="flex-direction:row;align-items:center;gap:6px">Un'altra aula su questo piano
          <select data-pa="altra"><option value="">—</option>${altre.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>` : ''}</div>` +
      `<div class="row" style="margin:8px 0"><button type="button" class="btn" data-pa="salva"${modifiche.size ? '' : ' disabled'}>📤 Salva sul Foglio</button>
        <span class="hint">${modifiche.size ? modifiche.size + ' aule da salvare' : ''}</span>
        ${scelta ? `<button type="button" class="btn" data-pa="togli">Togli ${esc(scelta)} dalla piantina</button>` : ''}</div>` +
      (messaggio ? `<p class="comp-messaggio" role="status">${esc(messaggio)}</p>` : '') +
      (!img ? '<p class="hint">Carico la piantina…</p>' : img.errore ? `<p class="comp-avviso">⚠️ ${esc(/401/.test(img.errore) ? 'il permesso di Google è scaduto' : img.errore)}.</p>
        <div class="row"><button type="button" class="btn" data-pa="riprova">Collega di nuovo a Google</button></div>`
        : `<div class="pa-contenitore${scelta ? ' pa-attiva' : ''}" data-pa="mappa">${Piantine.disegnoHtml(img.sorgente, segni, 'Piantina: ' + (Piantine.pianoInfo(piano) || {}).nome)}</div>`);
    if (!img) immagine(piano).then(disegna);
  }

  function clic(e) {
    const b = e.target.closest('[data-pa]'); if (!b || b.disabled) return;
    const a = b.dataset.pa;
    if (a === 'collega') collega();
    // cambiando piano, un errore di prima (per esempio permesso di Google scaduto) si riprova
    else if (a === 'piano') { piano = b.dataset.piano; scelta = ''; if ((indirizzi.get(piano) || {}).errore) indirizzi.delete(piano); disegna(); }
    else if (a === 'riprova') { indirizzi.clear(); stato = 'collega'; collega(); }
    else if (a === 'aula') { scelta = scelta === b.dataset.aula ? '' : b.dataset.aula; disegna(); }
    else if (a === 'salva') salva();
    else if (a === 'togli' && scelta) { modifiche.set(scelta, { piano: datiAula(scelta).piano, x: null, y: null }); disegna(); }
    else if (a === 'mappa' && scelta) {
      // Disegno SVG: toccando una stanza l'aula va al suo centro (data-cx / data-cy, in %)
      const st = e.target.closest('.stanza[data-cx][data-cy]');
      let x, y;
      if (st) { x = parseFloat(st.getAttribute('data-cx')); y = parseFloat(st.getAttribute('data-cy')); }
      else {
        // altrimenti la posizione in percentuale dell'immagine, così vale a qualsiasi grandezza
        const img = b.querySelector('.piantina img, .piantina svg'); if (!img || !e.clientX) return;
        const r = img.getBoundingClientRect();
        x = (e.clientX - r.left) / r.width * 100; y = (e.clientY - r.top) / r.height * 100;
      }
      if (isNaN(x) || isNaN(y) || x < 0 || y < 0 || x > 100 || y > 100) return;
      modifiche.set(scelta, { piano, x, y }); messaggio = '';
      disegna();
    }
  }
  function cambio(e) {
    const s = e.target.closest('[data-pa="altra"]'); if (!s || !s.value) return;
    const nome = s.value;
    modifiche.set(nome, { piano, x: datiAula(nome).x, y: datiAula(nome).y });
    scelta = nome; disegna();
  }

  function monta(el, contesto) {
    ctx = contesto;
    if (box !== el) { box = el; box.addEventListener('click', clic); box.addEventListener('change', cambio); box.addEventListener('keydown', e => Piantine.tastiera(e)); }
    if (typeof Piantine === 'undefined' || typeof NomiDocenti === 'undefined') { box.innerHTML = '<p class="hint">Mancano i file app/js/piantine.js o app/js/nomi.js.</p>'; return; }
    if (stato === 'collega' && Piantine.configurato() && NomiDocenti.gettoneDisponibile(PERMESSI())) { collega(); return; }
    disegna();
  }
  return { monta };
})();

/*
  calendario.js – vista «Impegni»: il calendario degli impegni collegiali dell'anno, in stile Google Calendar.

  Si apre con il tasto «Impegni» nella barra in alto (app.js, apriCalendario).
  - I dati stanno in dati/impegni.json (indirizzo in config.js, campo urlImpegni): sono presi dal foglio
    «Piano 26-27» del Piano annuale delle attività deliberato dal Collegio Docenti. Per cambiare una data
    basta modificare quel file, senza toccare il codice.
  - Ogni impegno ha un colore secondo la scuola (Istituto, Infanzia, Primaria, Secondaria): i colori
    sono in css/calendario.css. Toccando i tasti della legenda si mostrano o si nascondono le scuole
    (la scelta si ricorda su questo dispositivo).
  - In alto il mese a griglia; toccando un giorno, sotto compare l'elenco dei suoi impegni.
  - Da tastiera: frecce = giorno prima/dopo e settimana prima/dopo, Pagina su/giù = mese prima/dopo.
*/
const Calendario = (() => {
  const esc = s => Viste.esc(s);
  const CHIAVE_SCUOLE = 'orariodada.calendario.scuole';   // scuole nascoste dalla legenda
  const ORDINE = ['istituto', 'infanzia', 'primaria', 'secondaria'];
  const NOMI_MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const GIORNI_CORTI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const GIORNI_LUNGHI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

  let dati = null;          // contenuto di impegni.json
  let perGiorno = new Map(); // "2026-10-05" → elenco degli impegni di quel giorno (in ordine di ora)
  let nascoste = new Set();  // scuole nascoste dalla legenda
  let mese = null;           // primo giorno del mese mostrato (Date)
  let scelto = '';           // giorno toccato ("2026-10-05")
  let vista = null, opzioni = {};

  // Data nel formato "2026-10-05" (ora locale, non UTC)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daIso = s => { const [a, m, g] = s.split('-').map(Number); return new Date(a, m - 1, g); };
  // Giorno della settimana con il lunedì = 0 (in JavaScript la domenica è 0)
  const giornoSett = d => (d.getDay() + 6) % 7;
  const titoloMese = d => NOMI_MESI[d.getMonth()].replace(/^./, c => c.toUpperCase()) + ' ' + d.getFullYear();
  const dataLunga = s => { const d = daIso(s); return `${GIORNI_LUNGHI[giornoSett(d)]} ${d.getDate()} ${NOMI_MESI[d.getMonth()]} ${d.getFullYear()}`; };
  const orario = e => e.inizio ? `${e.inizio}–${e.fine}` : '';

  // Scuole nascoste: ricordate sul dispositivo (localStorage può non funzionare, per esempio in navigazione privata)
  function leggiNascoste() {
    try { return new Set(JSON.parse(localStorage.getItem(CHIAVE_SCUOLE) || '[]')); } catch (e) { return new Set(); }
  }
  function salvaNascoste() {
    try { localStorage.setItem(CHIAVE_SCUOLE, JSON.stringify([...nascoste])); } catch (e) { /* pazienza: vale fino alla chiusura */ }
  }

  // Scarica impegni.json una volta sola e prepara l'elenco per giorno
  let caricamento = null;
  function carica() {
    if (!caricamento) {
      caricamento = fetch(CONFIG.urlImpegni || '../dati/impegni.json', { cache: 'no-cache' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(j => {
          dati = j;
          perGiorno = new Map();
          (j.impegni || []).forEach(e => {
            if (!perGiorno.has(e.data)) perGiorno.set(e.data, []);
            perGiorno.get(e.data).push(e);
          });
          // nello stesso giorno: prima quelli senza orario (tutto il giorno), poi in ordine di ora, poi per scuola
          perGiorno.forEach(l => l.sort((a, b) => (a.inizio || '').localeCompare(b.inizio || '') ||
            ORDINE.indexOf(a.scuola) - ORDINE.indexOf(b.scuola)));
        })
        .catch(err => { caricamento = null; throw err; });   // al prossimo tentativo si riprova
    }
    return caricamento;
  }

  // Impegni visibili di un giorno (senza le scuole nascoste)
  const impegniDi = giorno => (perGiorno.get(giorno) || []).filter(e => !nascoste.has(e.scuola));

  // Primo e ultimo mese con impegni: le frecce non vanno oltre
  function limiti() {
    const date = [...perGiorno.keys()].sort();
    if (!date.length) return null;
    const p = daIso(date[0]), u = daIso(date[date.length - 1]);
    return { primo: new Date(p.getFullYear(), p.getMonth(), 1), ultimo: new Date(u.getFullYear(), u.getMonth(), 1) };
  }

  /* ---------- apertura ---------- */
  // contenitore = <section id="vistaCalendario">; opz.chiudi = funzione del tasto «Tabella»
  function apri(contenitore, opz) {
    vista = contenitore;
    opzioni = opz || {};
    nascoste = leggiNascoste();
    if (!vista.dataset.collegato) collega();
    vista.innerHTML = '<p class="vuoto-breve calendario-attesa">Carico gli impegni…</p>';
    carica().then(() => { mesePartenza(); disegna(); }).catch(() => {
      vista.innerHTML = `<div class="testata-breve testata-calendario"><div class="riga-testata">
          <span class="marchio-breve">Impegni</span>
          <button type="button" class="pulsante pulsante-tabella" data-cal="chiudi">Tabella</button></div>
          <h2 id="titoloCalendario">Impegni non disponibili</h2>
          <p class="data-breve">Non riesco a leggere il calendario degli impegni: controlla la connessione e riprova.</p>
        </div>`;
    });
  }

  // Si parte da oggi; fuori dall'anno scolastico, dal mese con impegni più vicino
  function mesePartenza() {
    const oggi = new Date(), lim = limiti();
    let m = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
    if (lim && m < lim.primo) m = lim.primo;
    if (lim && m > lim.ultimo) m = lim.ultimo;
    mese = m;
    scelto = m.getMonth() === oggi.getMonth() && m.getFullYear() === oggi.getFullYear() ? iso(oggi) : iso(m);
  }

  // Tasti e frecce: un solo ascoltatore sulla vista (i pezzi dentro vengono ridisegnati)
  function collega() {
    vista.dataset.collegato = '1';
    vista.addEventListener('click', e => {
      const b = e.target.closest('[data-cal], [data-giorno-cal]');
      if (!b) return;
      if (b.dataset.giornoCal) { scegli(b.dataset.giornoCal, false); return; }
      const azione = b.dataset.cal;
      if (azione === 'chiudi' && opzioni.chiudi) opzioni.chiudi();
      else if (azione === 'prima') cambiaMese(-1);
      else if (azione === 'dopo') cambiaMese(1);
      else if (azione === 'oggi') { mesePartenza(); disegna(); vista.querySelector('[data-cal="oggi"]').focus(); }
      else if (azione === 'vai') scegli(b.dataset.data, true);
    });
    // Legenda: ogni scuola è una casella da spuntare
    vista.addEventListener('change', e => {
      if (!e.target.matches('[data-scuola-cal]')) return;
      const s = e.target.dataset.scuolaCal;
      if (e.target.checked) nascoste.delete(s); else nascoste.add(s);
      salvaNascoste();
      disegna();
      vista.querySelector(`[data-scuola-cal="${s}"]`).focus();
    });
    vista.addEventListener('keydown', e => {
      if (e.key === 'Escape' && opzioni.chiudi) { opzioni.chiudi(); return; }
      if (!e.target.matches('[data-giorno-cal]')) return;
      const passi = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      if (e.key in passi) {
        e.preventDefault();
        const d = daIso(scelto);
        d.setDate(d.getDate() + passi[e.key]);
        scegli(iso(d), true);
      } else if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        cambiaMese(e.key === 'PageUp' ? -1 : 1, true);
      }
    });
  }

  // Sceglie un giorno (se è in un altro mese, cambia mese); focus = sposta lì il cursore della tastiera
  function scegli(giorno, focus) {
    scelto = giorno;
    const d = daIso(giorno);
    if (d.getMonth() !== mese.getMonth() || d.getFullYear() !== mese.getFullYear()) {
      mese = new Date(d.getFullYear(), d.getMonth(), 1);
      disegna();
    } else {
      // stesso mese: basta spostare la selezione e ridisegnare l'elenco del giorno
      vista.querySelectorAll('[data-giorno-cal]').forEach(b => {
        const si = b.dataset.giornoCal === giorno;
        b.setAttribute('aria-pressed', String(si));
        b.tabIndex = si ? 0 : -1;
      });
      vista.querySelector('#dettaglioCalendario').innerHTML = htmlDettaglio();
    }
    if (focus) { const b = vista.querySelector(`[data-giorno-cal="${giorno}"]`); if (b) b.focus(); }
  }

  // Mese prima (-1) o dopo (+1), senza uscire dall'anno degli impegni
  function cambiaMese(passo, focus) {
    const lim = limiti(), nuovo = new Date(mese.getFullYear(), mese.getMonth() + passo, 1);
    if (lim && (nuovo < lim.primo || nuovo > lim.ultimo)) return;
    mese = nuovo;
    // nel nuovo mese si sceglie lo stesso numero di giorno (o l'ultimo, se il mese è più corto)
    const ultimoGiorno = new Date(mese.getFullYear(), mese.getMonth() + 1, 0).getDate();
    scelto = iso(new Date(mese.getFullYear(), mese.getMonth(), Math.min(daIso(scelto).getDate(), ultimoGiorno)));
    disegna();
    const sel = focus ? `[data-giorno-cal="${scelto}"]` : `[data-cal="${passo < 0 ? 'prima' : 'dopo'}"]`;
    const b = vista.querySelector(sel);
    if (b && !b.disabled) b.focus(); else { const t = vista.querySelector(`[data-giorno-cal="${scelto}"]`); if (t) t.focus(); }
  }

  /* ---------- disegno ---------- */
  function disegna() {
    const lim = limiti();
    const primoMese = lim && mese <= lim.primo, ultimoMese = lim && mese >= lim.ultimo;
    const nomi = (dati && dati.scuole) || {};
    // Legenda = filtro: una casella colorata per scuola
    const legenda = ORDINE.map(s => `<label class="voce-legenda" data-scuola="${s}">
        <input type="checkbox" data-scuola-cal="${s}"${nascoste.has(s) ? '' : ' checked'}>
        <span class="pallino-scuola" aria-hidden="true"></span>${esc(nomi[s] || s)}</label>`).join('');
    vista.innerHTML = `
      <div class="testata-breve testata-calendario">
        <div class="riga-testata">
          <span class="marchio-breve">Piano delle attività ${esc((dati && dati.anno) || '')}</span>
          <button type="button" class="pulsante pulsante-tabella" data-cal="chiudi">Tabella</button>
        </div>
        <h2 id="titoloCalendario">Impegni</h2>
        <div class="navigazione-calendario">
          <button type="button" class="pulsante tasto-mese" data-cal="prima" aria-label="Mese precedente"${primoMese ? ' disabled' : ''}>‹</button>
          <p class="mese-calendario" aria-live="polite">${titoloMese(mese)}</p>
          <button type="button" class="pulsante tasto-mese" data-cal="dopo" aria-label="Mese successivo"${ultimoMese ? ' disabled' : ''}>›</button>
          <button type="button" class="pulsante tasto-oggi-cal" data-cal="oggi">Oggi</button>
        </div>
        <fieldset class="legenda-calendario"><legend class="sr-smart">Scuole da mostrare</legend>${legenda}</fieldset>
      </div>
      <div class="corpo-calendario">
        <div class="contenitore-griglia-cal">${htmlGriglia()}</div>
        <section id="dettaglioCalendario" class="dettaglio-calendario" aria-live="polite">${htmlDettaglio()}</section>
        ${htmlNote()}
      </div>`;
  }

  // Griglia del mese: una tabella (righe = settimane, colonne = giorni), ogni giorno è un tasto
  function htmlGriglia() {
    const oggi = iso(new Date());
    const inizio = new Date(mese);
    inizio.setDate(1 - giornoSett(mese));   // il lunedì della prima settimana
    let righe = '';
    const d = new Date(inizio);
    do {
      let celle = '';
      for (let g = 0; g < 7; g++) {
        const giorno = iso(d), fuori = d.getMonth() !== mese.getMonth(), lista = impegniDi(giorno);
        const classi = ['giorno-cal', fuori ? 'fuori-mese' : '', giorno === oggi ? 'oggi-cal' : '', g > 4 ? 'fine-settimana' : ''].filter(Boolean).join(' ');
        // al massimo 3 impegni nella casella, poi «+N»; sui telefoni si vedono solo i pallini (css)
        const chip = lista.slice(0, 3).map(e => `<span class="chip-cal" data-scuola="${e.scuola}"><span class="ora-chip">${e.inizio || ''}</span> ${esc(e.titolo)}</span>`).join('');
        const altri = lista.length > 3 ? `<span class="altri-cal">+${lista.length - 3}</span>` : '';
        const etichetta = `${dataLunga(giorno)}${giorno === oggi ? ', oggi' : ''}: ${lista.length ? lista.length + (lista.length === 1 ? ' impegno' : ' impegni') : 'nessun impegno'}`;
        celle += `<td><button type="button" class="${classi}" data-giorno-cal="${giorno}" aria-pressed="${giorno === scelto}"
            tabindex="${giorno === scelto ? 0 : -1}" aria-label="${etichetta}">
          <span class="numero-cal" aria-hidden="true">${d.getDate()}</span>
          <span class="chip-giorno" aria-hidden="true">${chip}${altri}</span></button></td>`;
        d.setDate(d.getDate() + 1);
      }
      righe += `<tr>${celle}</tr>`;
    } while (d.getMonth() === mese.getMonth());
    const testa = GIORNI_CORTI.map((n, i) => `<th scope="col"${i > 4 ? ' class="fine-settimana"' : ''}><abbr title="${GIORNI_LUNGHI[i]}">${n}</abbr></th>`).join('');
    return `<table class="griglia-calendario"><caption class="sr-smart">Impegni di ${titoloMese(mese)}</caption>
      <thead><tr>${testa}</tr></thead><tbody>${righe}</tbody></table>`;
  }

  // Elenco degli impegni del giorno scelto (o, se non ce ne sono, il prossimo giorno con impegni)
  function htmlDettaglio() {
    const lista = impegniDi(scelto), nomi = (dati && dati.scuole) || {};
    let html = `<h3 class="titolo-dettaglio-cal">${dataLunga(scelto).replace(/^./, c => c.toUpperCase())}</h3>`;
    if (!lista.length) {
      const prossimo = [...perGiorno.keys()].sort().find(g => g > scelto && impegniDi(g).length);
      html += '<p class="vuoto-breve">Nessun impegno in questo giorno.</p>';
      if (prossimo) html += `<button type="button" class="pulsante tasto-prossimo-cal" data-cal="vai" data-data="${prossimo}">Prossimo impegno: ${dataLunga(prossimo)} →</button>`;
      return html;
    }
    html += '<ul class="elenco-cal">' + lista.map(e => `<li class="impegno-cal" data-scuola="${e.scuola}">
        <span class="ora-impegno-cal">${orario(e) || 'Senza orario'}</span>
        <span class="titolo-impegno-cal">${esc(e.titolo)}</span>
        <span class="scuola-impegno-cal">${esc(nomi[e.scuola] || e.scuola)}</span>
        ${e.nota ? `<span class="nota-impegno-cal">${esc(e.nota)}</span>` : ''}
      </li>`).join('') + '</ul>';
    return html;
  }

  // In fondo: da dove vengono i dati, l'avviso del Dirigente e le sigle dei plessi
  function htmlNote() {
    if (!dati) return '';
    const sigle = Object.entries(dati.sigle || {}).map(([s, v]) => `<b>${esc(s)}</b> ${esc(v)}`).join(' · ');
    return `<div class="note-calendario">
      ${dati.avviso ? `<p>${esc(dati.avviso)}</p>` : ''}
      ${sigle ? `<p>${sigle}</p>` : ''}
      ${dati.fonte ? `<p>Fonte: ${esc(dati.fonte)}.</p>` : ''}
    </div>`;
  }

  return { apri, carica };
})();

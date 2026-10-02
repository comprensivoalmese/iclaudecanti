/*
  calendario.js – vista «Impegni»: il calendario degli impegni collegiali dell'anno, in stile Google Calendar.

  Si apre con il tasto «Impegni» nella barra in alto (app.js, apriCalendario).
  - Da dove vengono gli impegni (il primo che si riesce a leggere):
    1. «impegni-pubblicati.json» su Google Drive, pubblicato con «Importa dal Piano delle attività» (impegni-drive.js),
       letto con il permesso Google di chi ha fatto l'accesso (account della scuola);
    2. l'ultima copia salvata su questo dispositivo (chiave orariodada.impegni), se Drive adesso non risponde.
    NON c'è una copia su GitHub (dal 02/10/2026, scelta della scuola): il repository è pubblico e gli impegni
    li deve vedere solo chi accede con l'account della scuola. Se non si legge niente, il calendario resta vuoto
    con un messaggio (e, per chi è autorizzato, il tasto per importarli).
  - IMPORTARE (ogni anno, solo chi è autorizzato a Orario Facile): il tasto «Importa dal Piano delle attività»
    cerca il foglio nella cartella di Drive dei fogli di Orario Facile (o lo si sceglie dal computer, e allora
    viene salvato in quella cartella), lo legge con piano-attivita.js, mostra un'ANTEPRIMA nel calendario e,
    con «Pubblica per tutti», lo pubblica su Drive.
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

  let dati = null;          // gli impegni mostrati (file pubblicato su Drive, oppure anteprima dell'importazione)
  let perGiorno = new Map(); // "2026-10-05" → elenco degli impegni di quel giorno (in ordine di ora)
  let nascoste = new Set();  // scuole nascoste dalla legenda
  let mese = null;           // primo giorno del mese mostrato (Date)
  let scelto = '';           // giorno toccato ("2026-10-05")
  let vista = null, opzioni = {};
  let fonte = '';            // da dove vengono gli impegni: 'drive' o 'copia' ('' = nessun impegno letto)
  let problema = '';         // perché non ci sono impegni da mostrare (messaggio sopra la griglia)
  let pubblicati = null;     // gli impegni ufficiali, per tornarci se si annulla l'anteprima
  // Importazione in corso dal Piano delle attività (null = pannello chiuso):
  // { fase: 'cerco' | 'scelta' | 'leggo' | 'anteprima' | 'pubblico' | 'fatto' | 'errore', piani, messaggio, letto }
  let importa = null;
  const CHIAVE_COPIA = 'orariodada.impegni';   // ultima copia degli impegni letti da Drive
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

  // Prepara l'elenco per giorno degli impegni j (file pubblicato, copia sul dispositivo o anteprima)
  function usa(j) {
    dati = j;
    perGiorno = new Map();
    (j.impegni || []).forEach(e => {
      if (!perGiorno.has(e.data)) perGiorno.set(e.data, []);
      perGiorno.get(e.data).push(e);
    });
    // nello stesso giorno: prima quelli senza orario (tutto il giorno), poi in ordine di ora, poi per scuola
    perGiorno.forEach(l => l.sort((a, b) => (a.inizio || '').localeCompare(b.inizio || '') ||
      ORDINE.indexOf(a.scuola) - ORDINE.indexOf(b.scuola)));
  }

  const leggiCopia = () => { try { return JSON.parse(localStorage.getItem(CHIAVE_COPIA) || 'null'); } catch (e) { return null; } };
  const salvaCopia = j => { try { localStorage.setItem(CHIAVE_COPIA, JSON.stringify(j)); } catch (e) { /* spazio pieno: pazienza */ } };

  // Legge gli impegni: Drive → copia sul dispositivo (vedi in cima). Non lancia errori: se non c'è niente il
  // calendario resta vuoto e «problema» dice perché.
  // La lettura da Drive parte SUBITO (siamo nel tocco del tasto «Impegni»): se il permesso di Google manca,
  // Google può chiederlo con la sua finestra.
  async function carica() {
    problema = '';
    try {
      const j = await ImpegniDrive.leggiPubblicati(opzioni.email);
      salvaCopia(j);
      fonte = 'drive';
      return usa(pubblicati = j);
    } catch (e) {
      problema = e.nonPubblicati ? 'Gli impegni di quest\'anno non sono ancora stati pubblicati.'
        : 'Non riesco a leggere gli impegni da Google Drive (' + e.message + ').';
    }
    const copia = leggiCopia();
    if (copia && copia.impegni) { fonte = 'copia'; return usa(pubblicati = copia); }
    fonte = '';
    pubblicati = null;
    usa({ impegni: [] });
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
  // contenitore = <section id="vistaCalendario">; opz.chiudi = funzione del tasto «Tabella»,
  // opz.puoImportare = true per chi è autorizzato a Orario Facile, opz.email = chi ha fatto l'accesso
  function apri(contenitore, opz) {
    vista = contenitore;
    opzioni = opz || {};
    importa = null;
    nascoste = leggiNascoste();
    if (!vista.dataset.collegato) collega();
    vista.innerHTML = '<p class="vuoto-breve calendario-attesa">Carico gli impegni…</p>';
    carica().then(() => { mesePartenza(); disegna(); });
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
      else if (azione === 'importa') avviaImportazione();
      else if (azione === 'usa-piano') leggiDaDrive(b.dataset.id);
      else if (azione === 'pubblica') pubblicaAnteprima();
      else if (azione === 'chiudi-importa') chiudiImportazione();
    });
    // Legenda: ogni scuola è una casella da spuntare
    vista.addEventListener('change', e => {
      if (e.target.matches('[data-cal-file]')) { if (e.target.files[0]) leggiDalComputer(e.target.files[0]); return; }
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
        ${opzioni.puoImportare && !importa ? `<button type="button" class="pulsante tasto-importa" data-cal="importa">
          <span aria-hidden="true">⬆</span> Importa dal Piano delle attività</button>` : ''}
      </div>
      <div class="corpo-calendario">
        ${importa ? htmlImporta() : ''}
        ${!importa && !fonte ? `<p class="messaggio-importa" role="status">${esc(problema)} ${opzioni.puoImportare
          ? 'Puoi importarli con «Importa dal Piano delle attività».' : 'Riprova più tardi.'}</p>` : ''}
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
    if (!dati || !dati.impegni || !dati.impegni.length) return '';
    const sigle = Object.entries(dati.sigle || {}).map(([s, v]) => `<b>${esc(s)}</b> ${esc(v)}`).join(' · ');
    const quando = dati.aggiornato ? new Date(dati.aggiornato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const daDove = importa && importa.fase === 'anteprima' ? 'Anteprima: non ancora pubblicata.'
      : fonte === 'drive' ? `Pubblicato su Google Drive${quando ? ' il ' + quando : ''}.`
      : fonte === 'copia' ? `Ultima copia salvata su questo dispositivo${quando ? ' (pubblicata il ' + quando + ')' : ''}: Drive adesso non risponde.` : '';
    return `<div class="note-calendario">
      ${dati.avviso ? `<p>${esc(dati.avviso)}</p>` : ''}
      ${sigle ? `<p>${sigle}</p>` : ''}
      ${dati.fonte ? `<p>Fonte: ${esc(dati.fonte)}. ${daDove}</p>` : ''}
    </div>`;
  }

  /* ---------- importazione dal Piano delle attività (solo chi è autorizzato a Orario Facile) ---------- */
  // Il lettore dei fogli .xlsx/.ods è quello delle sostituzioni: si carica solo quando serve
  let caricamentoFoglio = null;
  function caricaFoglio() {
    if (typeof Foglio !== 'undefined') return Promise.resolve();
    if (!caricamentoFoglio) {
      caricamentoFoglio = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = '../sostituzioni/js/foglio.js';
        s.onload = ok;
        s.onerror = () => { caricamentoFoglio = null; ko(new Error('non riesco a caricare il lettore dei fogli (sei in rete?)')); };
        document.head.append(s);
      });
    }
    return caricamentoFoglio;
  }

  // Cambia la fase dell'importazione, ridisegna e porta il cursore sul pannello (lo leggono anche i lettori di schermo)
  function mostraImporta(fase, altro) {
    importa = Object.assign(importa || {}, { fase, messaggio: '' }, altro || {});
    disegna();
    const p = vista.querySelector('#pannelloImporta');
    if (p) p.focus();
  }

  // 1. Si cerca il piano nella cartella di Drive. La richiesta parte SUBITO, nello stesso tocco del tasto:
  //    così, se serve, Google può aprire la finestra del permesso (i browser la bloccano se arriva dopo)
  function avviaImportazione() {
    if (!ImpegniDrive.pronto()) { mostraImporta('errore', { messaggio: 'Google Drive non è configurato (config.js).' }); return; }
    const ricerca = ImpegniDrive.cercaPiani(opzioni.email);
    mostraImporta('cerco', { piani: [], letto: null });
    ricerca.then(piani => mostraImporta('scelta', { piani }))
      .catch(err => mostraImporta('scelta', { piani: [], messaggio: `Non riesco a guardare nella cartella di Drive (${err.message}). Puoi comunque scegliere il file dal computer.` }));
  }

  // 2a. Foglio scelto tra quelli della cartella di Drive
  function leggiDaDrive(id) {
    const f = (importa.piani || []).find(x => x.id === id);
    if (!f) return;
    const download = ImpegniDrive.scarica(f, opzioni.email);
    mostraImporta('leggo', { nomeFile: f.name });
    Promise.all([caricaFoglio(), download]).then(([, file]) => leggi(file, false))
      .catch(err => mostraImporta('errore', { messaggio: `Non riesco a scaricare «${f.name}»: ${err.message}.` }));
  }

  // 2b. File scelto dal computer: se si legge bene, viene salvato anche nella cartella di Drive (per gli anni dopo)
  function leggiDalComputer(file) {
    mostraImporta('leggo', { nomeFile: file.name });
    caricaFoglio().then(() => leggi(file, true))
      .catch(err => mostraImporta('errore', { messaggio: err.message }));
  }

  // 3. Lettura del foglio e anteprima nel calendario (per ora la vede solo chi importa)
  async function leggi(file, daSalvare) {
    let letto;
    try {
      letto = PianoAttivita.interpreta(await Foglio.leggiTabelle(file), file.name);
    } catch (err) {
      mostraImporta('errore', { messaggio: `Non riesco a leggere «${file.name}»: ${err.message}.` });
      return;
    }
    let messaggio = '';
    if (daSalvare) {
      try {
        const r = await ImpegniDrive.salvaNellaCartella(file, opzioni.email);
        messaggio = r.sostituito ? `Il file «${file.name}» nella cartella di Drive è stato aggiornato.`
          : `Il file «${file.name}» è stato salvato nella cartella di Drive dei fogli di Orario Facile.`;
      } catch (err) {
        messaggio = `Attenzione: non sono riuscito a salvare il file nella cartella di Drive (${err.message}).`;
      }
    }
    usa(letto);
    mesePartenza();
    mostraImporta('anteprima', { letto, messaggio });
  }

  // 4. «Pubblica per tutti»: impegni-pubblicati.json su Drive (la richiesta parte subito, come sopra)
  function pubblicaAnteprima() {
    const l = importa && importa.letto;
    if (!l) return;
    const j = { anno: l.anno, fonte: l.fonte, avviso: l.avviso, sigle: l.sigle, scuole: l.scuole, aggiornato: new Date().toISOString(), impegni: l.impegni };
    const invio = ImpegniDrive.pubblica(j, opzioni.email);
    mostraImporta('pubblico');
    invio.then(() => {
      salvaCopia(j);
      pubblicati = j;
      fonte = 'drive';
      usa(j);
      mostraImporta('fatto');
    }).catch(err => mostraImporta('anteprima', { messaggio: `Pubblicazione non riuscita: ${err.message}. Riprova.` }));
  }

  // Chiude il pannello; se c'era un'anteprima non pubblicata si torna agli impegni ufficiali
  function chiudiImportazione() {
    const fase = importa && importa.fase;
    importa = null;
    if (fase !== 'fatto') { usa(pubblicati || { impegni: [] }); mesePartenza(); }
    disegna();
    const b = vista.querySelector('[data-cal="importa"]');
    if (b) b.focus();
  }

  const dataCorta = s => daIso(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });

  // Il pannello dell'importazione, secondo la fase
  function htmlImporta() {
    const i = importa, nomi = (dati && dati.scuole) || {};
    const messaggio = i.messaggio ? `<p class="messaggio-importa">${esc(i.messaggio)}</p>` : '';
    if (i.fase === 'cerco') return pannello('<p>Cerco il Piano delle attività nella cartella di Drive dei fogli di Orario Facile…</p>');
    if (i.fase === 'leggo') return pannello(`<p>Leggo «${esc(i.nomeFile || '')}»…</p>`);
    if (i.fase === 'errore') {
      return pannello(`<p class="errore-importa">${esc(i.messaggio)}</p>
        <div class="tasti-importa"><button type="button" class="pulsante" data-cal="importa">Riprova</button></div>`);
    }
    if (i.fase === 'fatto') {
      return pannello(`<p>✔ <b>Pubblicato.</b> Da ora tutti vedono gli impegni del ${esc(dati.anno || '')} (${dati.impegni.length}).</p>
        <div class="tasti-importa"><button type="button" class="pulsante primario" data-cal="chiudi-importa">Chiudi</button></div>`);
    }
    if (i.fase === 'scelta') {
      const piani = (i.piani || []).map(f => `<li><button type="button" class="pulsante piano-importa" data-cal="usa-piano" data-id="${esc(f.id)}">
          <span class="nome-piano">📄 ${esc(f.name)}</span>
          <span class="data-piano">modificato il ${new Date(f.modifiedTime).toLocaleDateString('it-IT')}</span></button></li>`).join('');
      return pannello((piani
        ? `<p>Scegli il foglio del Piano annuale delle attività (fogli con «Piano» nel nome, nella cartella di Drive dei fogli di Orario Facile):</p>
          <ul class="piani-importa">${piani}</ul>`
        : '<p>Nella cartella di Drive dei fogli di Orario Facile non c\'è ancora un foglio con «Piano» nel nome.</p>') + messaggio +
        `<label class="file-importa">Oppure scegli il file dal computer (.xlsx o .ods): se si legge bene, viene salvato anche nella cartella di Drive.
          <input type="file" accept=".xlsx,.ods" data-cal-file></label>
        <p class="aiuto-importa">Il file deve essere fatto come quello del 2026/27: si legge il foglio che si chiama «Piano …» (per esempio «Piano 27-28»),
          con le colonne GIORNO, ORARIO, ISTITUTO, INFANZIA, PRIMARIA e SECONDARIA. Dei GLO resta solo il plesso, senza le classi.</p>`);
    }
    // anteprima (e pubblicazione in corso)
    const l = i.letto, conta = {}, inCorso = i.fase === 'pubblico';
    l.impegni.forEach(e => { conta[e.scuola] = (conta[e.scuola] || 0) + 1; });
    const perScuola = ORDINE.filter(s => conta[s]).map(s => `<span class="conta-importa" data-scuola="${s}">${esc(nomi[s] || s)} ${conta[s]}</span>`).join(' ');
    const scartate = l.scartate.length ? `<details class="scartate-importa"><summary>${l.scartate.length} ${l.scartate.length === 1 ? 'riga non importata' : 'righe non importate'}: controllale nel foglio</summary>
        <ul>${l.scartate.map(x => `<li>Riga ${x.riga}: ${esc(x.motivo)} – «${esc(x.testo)}»</li>`).join('')}</ul></details>` : '';
    return pannello(`<p><b>Anteprima</b> del foglio «${esc(l.foglio)}»: <b>${l.impegni.length} impegni</b> dal ${dataCorta(l.impegni[0].data)}
        al ${dataCorta(l.impegni[l.impegni.length - 1].data)}. Li vedi nel calendario qui sotto, ma per ora <b>solo tu</b>.</p>
      <p class="conte-importa">${perScuola}</p>${scartate}${messaggio}
      <div class="tasti-importa">
        <button type="button" class="pulsante primario" data-cal="pubblica"${inCorso ? ' disabled' : ''}>${inCorso ? 'Pubblico…' : 'Pubblica per tutti'}</button>
        <button type="button" class="pulsante" data-cal="chiudi-importa"${inCorso ? ' disabled' : ''}>Annulla</button>
      </div>`);
  }
  const pannello = corpo => `<section id="pannelloImporta" class="pannello-importa" tabindex="-1" aria-labelledby="titoloImporta" aria-live="polite">
      <div class="riga-importa"><h3 id="titoloImporta">Importa dal Piano delle attività</h3>
        <button type="button" class="pulsante leggero chiudi-importa" data-cal="chiudi-importa" aria-label="Chiudi l'importazione">✕</button></div>
      ${corpo}</section>`;


  return { apri };
})();

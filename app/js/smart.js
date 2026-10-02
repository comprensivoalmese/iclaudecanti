/*
  smart.js – pagina «Sostituzioni smart» dell'app Luis@i.

  È la scheda Sostituzioni di Orario Facile in versione semplice e rapida, con lo stile a schede di «In breve»:
  - Assenze del giorno (docente, ore, permesso), anche per più giorni della stessa settimana;
  - pulsanti dei giorni della settimana, con quante ore restano da coprire;
  - Ore da coprire, con i docenti proposti già in ordine (prima chi ha più ore a debito);
  - Assenze e sostituzioni di tutti (anche dei colleghi su altri dispositivi), con «Togli per tutti» e «Annulla per tutti»;
  - Stampa delle sostituzioni del giorno.
  Tutto il resto (autorizzazione, foglio del conteggio, abbinamenti, +1 / -1, registro su Drive) lo fa
  da solo lo stesso motore della scheda (sostituzioni/js/sostituzioni.js, Sostituzioni.collega):
  stesse regole e stessi dati, quindi quello che si fa qui si vede anche in Orario Facile e viceversa.

  La stessa pagina ha anche la modalità «Cambi d'aula» (voce di menu dedicata): lì c'è solo il modulo
  dei cambi d'aula (sostituzioni/js/cambi-aula.js) con la sua stampa.

  La pagina si apre dal menu (voce «Sostituzioni smart», icona con le persone) e funziona solo per chi è nel foglio
  «Autorizzazioni». I file del motore si caricano solo quando la si apre, per non appesantire l'app.
*/
const Smart = (() => {
  const esc = s => Viste.esc(s);
  // Chi il foglio «Autorizzazioni» ha già rifiutato su questo dispositivo: gli nascondiamo la voce del menu
  const CHIAVE_NEGATO = 'orariodada.sostNegato';
  const MOTORE = ['foglio.js', 'drive.js', 'archivio.js', 'abbinamenti.js', 'registro-drive.js', 'sostituzioni.js', 'cambi-aula.js', 'uscite.js']
    .map(f => '../sostituzioni/js/' + f);
  const PROPOSTE = 3;   // quanti docenti proporre per ogni ora prima di «Mostra tutti»
  const ICONA_AULA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

  let motore = null;          // le funzioni di Sostituzioni.collega
  let box = null;             // l'elemento della pagina
  let contesto = null;        // { orario(), chiudi(), email }
  let caricamento = null;     // caricamento in corso dei file del motore
  let modo = 'sostituzioni'; // 'sostituzioni' (Sostituzioni smart) oppure 'cambi' (pagina «Cambi d'aula»)
  let iso = '';               // il giorno mostrato ("2026-09-28")
  const aperte = new Set();   // ore per cui si vedono tutti i docenti proposti
  // modulo "Assenze del giorno": restano scelti anche quando la pagina si ridisegna
  let docenteScelto = '';
  let permesso = true;
  let timerMessaggio = null;

  const leggi = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  const scrivi = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) { /* ignorato */ } };
  const negato = email => !!email && leggi(CHIAVE_NEGATO) === String(email).toLowerCase();

  /* ---------- caricamento dei file del motore (una volta sola) ---------- */
  function caricaScript(src) {
    return new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => ko(new Error('non riesco a caricare ' + src + ' (sei in rete?)'));
      document.head.append(s);
    });
  }
  function caricaMotore() {
    if (typeof Sostituzioni !== 'undefined' && Sostituzioni.collega && typeof CambiAula !== 'undefined') return Promise.resolve();
    if (!caricamento) {
      caricamento = MOTORE.reduce((prima, src) => prima.then(() => caricaScript(src)), Promise.resolve())
        .catch(e => { caricamento = null; throw e; });
    }
    return caricamento;
  }

  // L'orario UFFICIALE pubblicato: le sostituzioni si fanno sempre su quello, mai sulla bozza di Orario Facile.
  // Se l'app sta mostrando la bozza (solo sul dispositivo di chi lavora in Orario Facile) lo si scarica a parte.
  let pubblicato = null;
  // Copia dell'orario: il motore ci mette i nomi veri dei docenti e non deve toccare quello della tabella
  function copiaOrario() {
    const A = contesto.orario();
    const D = A.fonte === 'bozza' && pubblicato ? pubblicato : A;
    const docente = D.docente.map(t => Object.assign({}, t));
    const mappa = Object.assign({}, D.mappa, { docente: new Map(docente.map(t => [t.id, t])) });
    return Object.assign({}, D, { docente, mappa });
  }

  /* ---------- messaggi (in basso, come nella scheda) ---------- */
  function avvisa(testo) {
    const m = box && box.querySelector('#smartMessaggio');
    if (!m) return;
    m.textContent = testo;
    m.hidden = false;
    clearTimeout(timerMessaggio);
    timerMessaggio = setTimeout(() => { m.hidden = true; }, Math.max(5000, testo.length * 65));
  }

  /* ---------- testi ---------- */
  const ore = n => n === 1 ? '1 ora' : n + ' ore';
  function testoSaldo(saldo) {
    if (!saldo) return { testo: 'non nel foglio', tipo: '' };
    const n = saldo.attuale;
    return n < 0 ? { testo: `${ore(-n)} a debito`, tipo: 'debito' }
      : n > 0 ? { testo: `${ore(n)} a credito`, tipo: 'credito' } : { testo: 'in pari', tipo: '' };
  }
  const etichetta = saldo => { const s = testoSaldo(saldo); return `<span class="saldo-smart ${s.tipo}">${esc(s.testo)}</span>`; };

  /* ---------- disegno ---------- */
  function disegna() {
    if (!box || box.hidden || !motore) return;
    const D = motore.orario();
    const zona = box.querySelector('#smartContenuto');
    if (!D || !zona) return;
    const st = motore.stato();

    // Chi non è autorizzato non vede niente altro: solo un messaggio (e la voce del menu sparisce)
    if (st.abilitazione.stato === 'no') scrivi(CHIAVE_NEGATO, String(contesto.email || '').toLowerCase());
    if (st.abilitazione.stato === 'si' && negato(contesto.email)) scrivi(CHIAVE_NEGATO, '');
    if (!st.puoFare) { zona.innerHTML = testataHtml(D, st) + `<div class="schede-breve">${schedaAccesso(st)}</div>`; return; }

    // Ricordo il campo che aveva il focus, per rimetterlo dopo il nuovo disegno
    const focus = document.activeElement && box.contains(document.activeElement) ? document.activeElement.id : '';
    if (modo === 'cambi') {
      // Pagina «Cambi d'aula»: il modulo condiviso con Orario Facile (sostituzioni/js/cambi-aula.js) e la sua stampa
      zona.innerHTML = testataHtml(D, st) + '<div class="schede-breve" id="smartCambi"></div>' + stampaCambiHtml(D);
      if (typeof CambiAula !== 'undefined') CambiAula.disegna(zona.querySelector('#smartCambi'), iso, 'smart');
    } else {
      zona.innerHTML = testataHtml(D, st) + `<div class="schede-breve">${schedaAssenze(D)}</div>` + oreHtml(D) + tutteHtml() + stampaHtml(D);
    }
    if (focus && document.getElementById(focus)) document.getElementById(focus).focus();
  }

  function testataHtml(D, st) {
    const elenco = Breve.giorniDiScuola(D);
    // Giorno mostrato: all'apertura il primo giorno di scuola (oggi, o il prossimo), poi quello scelto nella tendina
    if (!iso) iso = (elenco[0] || {}).iso || motore.giornoPredefinito();
    const scelto = elenco.find(g => g.iso === iso);
    const adesso = new Date();
    const mom = Breve.momento(adesso.getHours() * 60 + adesso.getMinutes());
    const giorni = elenco.map(g => `<option value="${g.iso}"${g.iso === iso ? ' selected' : ''}>${esc(g.testo.charAt(0).toUpperCase() + g.testo.slice(1))}</option>`).join('');
    return `<div class="testata-breve" data-momento="${mom}">
      <div class="riga-testata"><span class="marchio-breve">${modo === 'cambi' ? '⇄ Cambi d\'aula' : '👥 Sostituzioni smart'}</span>
        <button type="button" id="smartChiudi" class="pulsante pulsante-tabella">Tabella</button></div>
      <h2 id="titoloSmart">${modo === 'cambi' ? 'Cambi d\'aula' : 'Sostituzioni'}</h2>
      <p class="data-breve">${esc(scelto ? scelto.testo : iso)}${st.abilitazione.nome ? ' · ' + esc(st.abilitazione.nome) : ''}</p>
      ${giorni ? `<div class="scelte-breve"><label class="scelta-breve" for="smartGiorno"><span>Giorno</span>
        <select id="smartGiorno">${giorni}</select></label></div>` : ''}
      ${st.puoFare && modo !== 'cambi' ? settimanaHtml(elenco) : ''}
    </div>`;
  }

  // Un pulsante per ogni giorno della settimana (da oggi in poi) con le ore ancora da coprire:
  // si vede solo se in settimana c'è almeno un'assenza
  function settimanaHtml(elenco) {
    const giorni = motore.giorniSettimana(iso).filter(g => elenco.some(e => e.iso === g.iso));
    const conti = giorni.map(g => motore.contaGiorno(g.iso));
    if (!conti.some(c => c.totale)) return '';
    return `<nav class="settimana-smart" aria-label="Giorni della settimana">` + giorni.map((g, i) => {
      const c = conti[i];
      const testo = c.mancano ? `${c.mancano} da coprire` : c.totale ? '✔ coperte' : 'nessuna';
      const nome = motore.dataCorta(g.iso);
      return `<button type="button" class="giorno-smart${g.iso === iso ? ' scelto' : ''}${c.mancano ? ' scoperto' : ''}"
        data-azione="vai" data-iso="${g.iso}"${g.iso === iso ? ' aria-current="date"' : ''}>
        <b>${esc(nome.charAt(0).toUpperCase() + nome.slice(1))}</b><span>${esc(testo)}</span></button>`;
    }).join('') + '</nav>';
  }

  // Autorizzazione in corso, rifiutata o non riuscita: un solo messaggio semplice
  function schedaAccesso(st) {
    const a = st.abilitazione;
    const testo = {
      'da-verificare': 'Controllo la tua autorizzazione…',
      verifica: 'Controllo la tua autorizzazione…',
      no: `⛔ Il tuo account non è autorizzato a fare le sostituzioni${a.messaggio ? ' (' + a.messaggio + ')' : ''}. Chiedi a chi gestisce il foglio «Autorizzazioni» di aggiungerti.`,
      errore: `⚠️ Non riesco a controllare l'autorizzazione: ${a.messaggio}.`
    }[a.stato] || 'Controllo la tua autorizzazione…';
    const riprova = a.stato === 'errore' || a.stato === 'da-verificare'
      ? '<button type="button" class="pulsante" data-azione="riprova">↻ Riprova</button>' : '';
    return `<article class="scheda-breve"><p class="vuoto-breve">${esc(testo)}</p>${riprova}</article>`;
  }

  // 1. Assenze del giorno: docente, ore da spuntare, permesso; sotto, gli assenti già registrati
  function schedaAssenze(D) {
    const giorno = motore.giornoOrario(iso);
    const docenti = D.docente.slice().sort((a, b) => motore.nomeDocente(a.id).localeCompare(motore.nomeDocente(b.id), 'it'));
    if (docenteScelto && !D.mappa.docente.has(docenteScelto)) docenteScelto = '';
    const opzioni = '<option value="">— scegli il docente assente —</option>' + docenti.map(t =>
      `<option value="${esc(t.id)}"${t.id === docenteScelto ? ' selected' : ''}>${esc(motore.nomeDocente(t.id))}</option>`).join('');
    const assenti = motore.assenzeDel(iso);

    let oreHtml = '';
    if (docenteScelto && giorno) {
      // lezioni e ore di compresenza (anche un compresente si può segnare assente)
      const lezioni = motore.impegniDi(docenteScelto, giorno);
      const gia = new Set((assenti.find(a => a.docente === docenteScelto) || { ore: [] }).ore);
      oreHtml = lezioni.length
        ? `<fieldset class="ore-smart"><legend>Ore di assenza</legend>` + lezioni.map(l =>
          `<label class="ora-smart"><input type="checkbox" data-ora="${l.ora}"${gia.size ? (gia.has(l.ora) ? ' checked' : '') : ' checked'}>
            <span><b>${l.ora}ª</b> ${esc(motore.nome('classe', l.classe))}${l.compresenza ? ' · compresenza' : ''}</span></label>`).join('') + '</fieldset>' +
          altriGiorniHtml() +
          `<label class="permesso-smart"><input type="checkbox" id="smartPermesso"${permesso ? ' checked' : ''}>
            <span><b>Recupero</b> · le ore sono a debito del docente</span></label>
          <button type="button" class="pulsante primario" data-azione="registra">Registra l'assenza</button>`
        : '<p class="vuoto-breve">Questo docente non ha lezioni in questo giorno.</p>';
    }

    const elenco = assenti.length
      ? '<ul class="assenti-smart">' + assenti.map(a => `<li><span><b>${esc(motore.nomeDocente(a.docente))}</b>
          · ${a.ore.map(n => n + 'ª').join(', ')}${a.permesso ? ' · <span class="tag-smart">recupero</span>' : ''}</span>
          <button type="button" class="pulsante" data-azione="togli" data-id="${esc(a.id)}"
            aria-label="Togli l'assenza di ${esc(motore.nomeDocente(a.docente))}">Togli</button></li>`).join('') + '</ul>'
      : '';

    return `<article class="scheda-breve scheda-assenze">
      <div class="riga-breve"><span class="pill-breve">Assenze del giorno</span></div>
      ${giorno ? `<label class="sr-smart" for="smartDocente">Docente assente</label>
        <select id="smartDocente" class="campo-smart">${opzioni}</select>${oreHtml}`
        : '<p class="vuoto-breve">In questo giorno non ci sono lezioni.</p>'}
      ${elenco}
    </article>`;
  }

  // Assente più giorni: gli altri giorni della settimana in cui il docente ha lezione, spuntando le singole ore
  function altriGiorniHtml() {
    const altri = motore.altriGiorniDi(iso, docenteScelto);
    if (!altri.length) return '';
    return `<fieldset class="ore-smart"><legend>Assente anche in altri giorni della settimana? Spunta le ore</legend>` +
      altri.map(g => {
        const gia = new Set((motore.assenzeDel(g.iso).find(a => a.docente === docenteScelto) || { ore: [] }).ore);
        return `<p class="dettagli-breve"><b>${esc(motore.dataCorta(g.iso))}</b>${gia.size ? ' · già assente' : ''}</p>` +
          g.lezioni.map(l => `<label class="ora-smart"><input type="checkbox" data-altra="${g.iso}|${l.ora}"${gia.has(l.ora) ? ' checked' : ''}>
            <span><b>${l.ora}ª</b> ${esc(motore.nome('classe', l.classe))}${l.compresenza ? ' · compresenza' : ''}</span></label>`).join('');
      }).join('') + '</fieldset>';
  }

  // 2. Ore da coprire: una scheda grande per ogni ora, con i docenti proposti
  function oreHtml(D) {
    const elenco = motore.oreDaCoprire(iso);
    if (!elenco.length) return '';
    const schede = elenco.map(l => {
      const chiave = [iso, l.ora, l.classe, l.assente].join('|');
      const s = motore.sostituzioneDi(iso, l);
      const testa = `<div class="riga-breve"><span class="pill-breve${s ? ' pill-coperta' : ''}">${s ? '✔ Coperta' : 'Da coprire'}</span>
          <span class="dettagli-breve">${esc(motore.testoOra(l.ora))}</span></div>
        <div class="riga-breve"><span class="materia-breve">${esc(motore.nome('classe', l.classe))} · ${esc(l.materia || '')}</span>
          <span class="dettagli-breve">assente ${esc(motore.nomeDocente(l.assente))}</span></div>
        ${l.aula ? `<span class="aula-ora">${ICONA_AULA}<span class="sr-smart">Aula: </span>${esc(motore.nome('aula', l.aula))}</span>` : ''}`;
      if (s) {
        const occupato = motore.inCorso(s.id);
        return `<li class="scheda-breve scheda-ora coperta-smart">${testa}
          <p class="sostituto-smart">Sostituisce <b>${esc(motore.nomeDocente(s.sostituto))}</b> ${etichetta(motore.saldoDi(s.sostituto))}${s.spostato
            ? `<span class="motivo-smart">🔁 spostato da ${esc(motore.nome('classe', s.spostato.da))}: nessuna ora in più</span>` : ''}</p>
          <button type="button" class="pulsante" data-azione="annulla" data-chiave="${esc(chiave)}"${occupato ? ' disabled' : ''}>
            ${occupato ? 'Aggiorno il foglio…' : 'Annulla la sostituzione'}</button></li>`;
      }
      const tutti = motore.candidati(iso, l).filter(c => c.aScuola);
      const visibili = aperte.has(chiave) ? tutti : tutti.slice(0, PROPOSTE);
      const proposte = visibili.length
        ? '<ul class="proposte-smart">' + visibili.map(c => `<li><button type="button" class="proposta-smart" data-azione="assegna"
              data-chiave="${esc(chiave)}" data-docente="${esc(c.t.id)}"
              aria-label="Assegna la ${l.ora}ª ora in ${esc(motore.nome('classe', l.classe))} a ${esc(motore.nomeDocente(c.t.id))}">
            <b>${esc(motore.nomeDocente(c.t.id))}</b>${etichetta(c.saldo)}
            <span class="motivo-smart">${esc(c.motivo)}</span>
          </button></li>`).join('') + '</ul>'
        : '<p class="vuoto-breve">Nessun docente libero e già a scuola in quest\'ora.</p>';
      const altri = tutti.length > PROPOSTE && !aperte.has(chiave)
        ? `<button type="button" class="pulsante" data-azione="tutti" data-chiave="${esc(chiave)}">Mostra tutti (${tutti.length})</button>` : '';
      return `<li class="scheda-breve scheda-ora">${testa}${proposte}${altri}</li>`;
    }).join('');
    return `<h3 class="titoletto-breve">Ore da coprire</h3><ol class="giornata-breve ore-coprire-smart">${schede}</ol>`;
  }

  // 3. Assenze e sostituzioni di tutti del giorno scelto (anche dei colleghi, su altri dispositivi): ogni assenza con
  //    «Togli per tutti», ogni sostituzione con «Annulla per tutti». L'elenco lo prepara il motore
  //    (Sostituzioni: caricaTutte, tutte, annullaPerTutti, togliAssenzaPerTutti)
  function tutteHtml() {
    const t = motore.tutte();
    const pulsante = `<button type="button" class="pulsante" data-azione="tutte-carica"${t.stato === 'carico' ? ' disabled' : ''}>` +
      `${t.stato === 'mai' ? '👥 Mostra le assenze e le sostituzioni di tutti' : t.stato === 'carico' ? 'Leggo…' : '↻ Aggiorna l\'elenco'}</button>`;
    let corpo = '';
    if (t.stato !== 'mai') {
      const assenzeG = t.assenze.map((a, i) => ({ a, i })).filter(x => x.a.data === iso);
      const delGiorno = t.elenco.map((v, i) => ({ v, i })).filter(x => x.v.data === iso);
      corpo = (assenzeG.length
        ? '<ul class="assenti-smart">' + assenzeG.map(({ a, i }) => {
          const occupato = motore.inCorsoAssenza(a);
          return `<li><span><b>${esc(motore.nomeDocente(a.docente))}</b> assente · ${(a.ore || []).map(n => n + 'ª').join(', ')}
              ${a.qui ? '' : ' · <span class="tag-smart">altro dispositivo</span>'}</span>
            <button type="button" class="pulsante" data-azione="togli-tutti" data-i="${i}"${occupato ? ' disabled' : ''}
              aria-label="Togli per tutti l'assenza di ${esc(motore.nomeDocente(a.docente))}">
              ${occupato ? 'Aggiorno i fogli…' : 'Togli per tutti'}</button></li>`;
        }).join('') + '</ul>' : '') +
        (delGiorno.length
        ? '<ul class="assenti-smart">' + delGiorno.map(({ v, i }) => {
          const occupato = motore.inCorso(v.id);
          return `<li><span><b>${v.ora}ª ora · ${esc(motore.nome('classe', v.classe))}</b> · ${esc(motore.nomeDocente(v.assente))} assente →
              <b>${esc(motore.nomeDocente(v.sostituto))}</b>${v.qui ? '' : ' · <span class="tag-smart">altro dispositivo</span>'}</span>
            <button type="button" class="pulsante" data-azione="annulla-tutti" data-i="${i}"${occupato ? ' disabled' : ''}
              aria-label="Annulla per tutti la sostituzione della ${v.ora}ª ora in ${esc(motore.nome('classe', v.classe))}">
              ${occupato ? 'Aggiorno i fogli…' : 'Annulla per tutti'}</button></li>`;
        }).join('') + '</ul>'
        : '') || '<p class="vuoto-breve">Nessuna assenza né sostituzione in questo giorno.</p>';
    }
    return `<h3 class="titoletto-breve">Assenze e sostituzioni di tutti</h3><div class="schede-breve"><article class="scheda-breve">
      <p class="dettagli-breve">Anche quelle registrate dai colleghi su altri dispositivi. «Annulla per tutti» toglie 1 ora al sostituto
        nel foglio del conteggio e fa sparire la sostituzione per tutti. «Togli per tutti» toglie l'assenza: annulla anche le sue
        sostituzioni e restituisce le ore di recupero nel foglio del conteggio.</p>
      ${t.messaggio ? `<p class="vuoto-breve">⚠️ ${esc(t.messaggio)}.</p>` : ''}${corpo}${pulsante}</article></div>`;
  }

  // 4. Stampa: la tabella del giorno (si vede solo in stampa) e il pulsante
  function stampaHtml(D) {
    const elenco = motore.oreDaCoprire(iso);
    if (!elenco.length) return '';
    const righe = elenco.map(l => {
      const s = motore.sostituzioneDi(iso, l);
      return `<tr><th scope="row">${esc(motore.testoOra(l.ora))}</th><td>${esc(motore.nome('classe', l.classe))}</td>
        <td>${esc(l.aula ? motore.nome('aula', l.aula) : '')}</td><td>${esc(l.materia || '')}</td>
        <td>${esc(motore.nomeDocente(l.assente))}</td><td>${s ? esc(motore.nomeDocente(s.sostituto)) : '—'}</td></tr>`;
    }).join('');
    const scelto = Breve.giorniDiScuola(D).find(g => g.iso === iso);
    return `<div class="stampa-smart-pulsante"><button type="button" class="pulsante" data-azione="stampa">🖨️ Stampa le sostituzioni del giorno</button></div>
      <div class="solo-stampa-smart"><h2>Sostituzioni · ${esc(scelto ? scelto.testo : iso)}</h2>
        <table><thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Aula</th><th scope="col">Materia</th>
          <th scope="col">Assente</th><th scope="col">Sostituisce</th></tr></thead><tbody>${righe}</tbody></table></div>`;
  }

  // Stampa della pagina «Cambi d'aula»: solo la tabella dei cambi del giorno
  function stampaCambiHtml(D) {
    const cambi = typeof CambiAula !== 'undefined' ? CambiAula.tabellaStampa(iso) : '';
    if (!cambi) return '';
    const scelto = Breve.giorniDiScuola(D).find(g => g.iso === iso);
    return `<div class="stampa-smart-pulsante"><button type="button" class="pulsante" data-azione="stampa">🖨️ Stampa i cambi d'aula del giorno</button></div>
      <div class="solo-stampa-smart"><h2>Cambi d'aula · ${esc(scelto ? scelto.testo : iso)}</h2>${cambi}</div>`;
  }

  /* ---------- azioni ---------- */
  // La lezione di una scheda "Ore da coprire" a partire dalla sua chiave
  const lezioneDi = chiave => motore.oreDaCoprire(iso).find(l => [iso, l.ora, l.classe, l.assente].join('|') === chiave);

  function clic(e) {
    const b = e.target.closest('button');
    if (!b || !box.contains(b)) return;
    if (b.id === 'smartChiudi') { contesto.chiudi(); return; }
    const azione = b.dataset.azione;
    if (azione === 'riprova') { motore.verifica(); return; }
    if (azione === 'registra') {
      const oreScelte = [...box.querySelectorAll('input[data-ora]:checked')].map(c => Number(c.dataset.ora));
      if (!oreScelte.length) { avvisa('Spunta almeno un\'ora di assenza.'); return; }
      const cb = box.querySelector('#smartPermesso');
      // altri giorni: le ore spuntate, raggruppate per giorno ({ iso, ore })
      const perGiorno = new Map();
      box.querySelectorAll('input[data-altra]:checked').forEach(c => {
        const [g, o] = c.dataset.altra.split('|');
        if (!perGiorno.has(g)) perGiorno.set(g, []);
        perGiorno.get(g).push(Number(o));
      });
      const altriGiorni = [...perGiorno].map(([g, o]) => ({ iso: g, ore: o }));
      if (motore.registraAssenza(iso, docenteScelto, oreScelte, cb ? cb.checked : true, altriGiorni)) { docenteScelto = ''; permesso = true; disegna(); }
      return;
    }
    if (azione === 'vai') { iso = b.dataset.iso; aperte.clear(); docenteScelto = ''; disegna(); return; }
    if (azione === 'togli') {
      const a = motore.assenzeDel(iso).find(x => x.id === b.dataset.id);
      if (a) motore.togliAssenza(a);
      return;
    }
    if (azione === 'assegna') {
      const l = lezioneDi(b.dataset.chiave);
      // le opzioni le decide il motore (c.opzioni): un docente «liberato» da un'uscita didattica o spostato da una
      // compresenza copre senza ore in più
      const c = l && motore.candidati(iso, l).find(x => x.t.id === b.dataset.docente);
      if (l) { b.disabled = true; motore.assegna(iso, l, b.dataset.docente, c ? c.opzioni : undefined); }
      return;
    }
    if (azione === 'annulla') {
      const l = lezioneDi(b.dataset.chiave);
      const s = l && motore.sostituzioneDi(iso, l);
      if (s) motore.annulla(s);
      return;
    }
    if (azione === 'tutti') { aperte.add(b.dataset.chiave); disegna(); return; }
    if (azione === 'tutte-carica') { motore.caricaTutte(); return; }
    if (azione === 'annulla-tutti') {
      const v = motore.tutte().elenco[Number(b.dataset.i)];
      if (v && confirm(motore.domandaPerTutti(v))) motore.annullaPerTutti(v);
      return;
    }
    if (azione === 'togli-tutti') {
      const a = motore.tutte().assenze[Number(b.dataset.i)];
      if (a) motore.togliAssenzaPerTutti(a);   // la conferma la chiede il motore
      return;
    }
    if (azione === 'stampa') stampa();
  }

  function cambio(e) {
    const t = e.target;
    if (t.id === 'smartGiorno') { iso = t.value; aperte.clear(); docenteScelto = ''; disegna(); box.querySelector('#smartGiorno').focus(); }
    else if (t.id === 'smartDocente') {
      docenteScelto = t.value;
      const gia = motore.assenzeDel(iso).find(a => a.docente === docenteScelto);
      permesso = gia ? gia.permesso !== false : true;   // docente già assente: riprende la sua scelta
      disegna();
    } else if (t.id === 'smartPermesso') permesso = t.checked;
  }

  // Stampa solo la tabella del giorno: durante la stampa il resto dell'app viene nascosto (css/smart.css)
  function stampa() {
    document.body.classList.add('stampa-smart');
    window.addEventListener('afterprint', () => document.body.classList.remove('stampa-smart'), { once: true });
    window.print();
  }

  /* ---------- apertura ---------- */
  /*
    Apre la pagina nell'elemento indicato.
    ctx = { orario(): l'orario dell'app, chiudi(): torna alla tabella, email: di chi ha fatto l'accesso }
    Va chiamata direttamente dal tocco sulla voce del menu: così Google può chiedere il permesso
    (l'autorizzazione e il foglio del conteggio si leggono da Drive con l'account dell'utente).
  */
  async function apri(el, ctx) {
    contesto = ctx;
    modo = ctx.modo === 'cambi' ? 'cambi' : 'sostituzioni';
    const titolo = modo === 'cambi' ? 'Cambi d\'aula' : 'Sostituzioni';
    if (box !== el) {
      box = el;
      box.innerHTML = '<div id="smartContenuto"></div><p id="smartMessaggio" class="messaggio-smart" role="status" aria-live="polite" hidden></p>';
      box.addEventListener('click', clic);
      box.addEventListener('change', cambio);
    }
    iso = '';
    aperte.clear();
    box.querySelector('#smartContenuto').innerHTML = `<div class="testata-breve"><h2 id="titoloSmart">${titolo}</h2>
      <p class="data-breve">Preparo la pagina…</p></div>`;
    // Il permesso di Google si chiede SUBITO, finché vale ancora il tocco sul menu
    // (altrimenti il browser bloccherebbe la finestra di Google)
    let permessoGoogle = Promise.resolve();
    if (typeof NomiDocenti !== 'undefined' && typeof CONFIG !== 'undefined' && CONFIG.googleClientId) {
      permessoGoogle = NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, 'https://www.googleapis.com/auth/spreadsheets'], ctx.email)
        .catch(e => { console.error(e); });
    }
    try {
      await caricaMotore();
    } catch (errore) {
      box.querySelector('#smartContenuto').innerHTML = `<div class="testata-breve"><h2 id="titoloSmart">${titolo}</h2>
        <p class="data-breve">⚠️ ${esc(errore.message)}</p></div>`;
      return;
    }
    await permessoGoogle;
    // l'app mostra la bozza di Orario Facile: per le sostituzioni serve l'orario ufficiale pubblicato
    pubblicato = null;
    if (ctx.orario().fonte === 'bozza') {
      try { pubblicato = await Dati.caricaPubblicato(); }
      catch (errore) {
        box.querySelector('#smartContenuto').innerHTML = `<div class="testata-breve"><h2 id="titoloSmart">${titolo}</h2>
          <p class="data-breve">⚠️ Non riesco a leggere l'orario ufficiale pubblicato (${esc(errore.message)}): le sostituzioni si fanno solo su quello.</p></div>`;
        return;
      }
    }
    if (!motore) motore = Sostituzioni.collega(copiaOrario, { avvisa, ridisegna: disegna });
    else motore.aggiorna();
    // Con il permesso di Google già dato, il motore controlla da solo l'autorizzazione e legge il foglio del conteggio
    const st = motore.stato();
    if (st.abilitazione.stato === 'da-verificare') motore.verifica();
    // Aperta dal tasto «✕ Annulla» di una sostituzione nella tabella: si passa ad annullarla
    // Aperta dal tasto «✕ Togli assenza»: ctx.annulla = { assenza }
    if (ctx.annulla && modo === 'sostituzioni') {
      if (ctx.annulla.assenza) togliAssenzaDaTabella(ctx.annulla.assenza);
      else annullaDaTabella(ctx.annulla);
    }
  }

  // Aspetta (al massimo 30 secondi) il controllo del foglio «Autorizzazioni»; restituisce true se si può procedere
  async function attendiAutorizzazione(cosa) {
    const inAttesa = () => motore.stato().conRegistro && ['da-verificare', 'verifica'].includes(motore.stato().abilitazione.stato);
    for (let i = 0; i < 100 && inAttesa(); i++) await new Promise(r => setTimeout(r, 300));
    if (motore.stato().puoFare) return true;
    avvisa(`Non posso ${cosa}: il tuo account non risulta autorizzato alle sostituzioni (foglio «Autorizzazioni»).`);
    return false;
  }

  /*
    Toglie l'assenza scelta nella tabella (tasto «✕ Togli assenza», voce di supplenze.js): mostra il suo giorno e lascia
    fare al motore (Sostituzioni.togliAssenzaPerTutti), che chiede conferma, annulla le sue sostituzioni (−1 a chi
    sostituiva), restituisce le ore di recupero nel foglio del conteggio e pubblica, così l'assenza sparisce per tutti.
  */
  async function togliAssenzaDaTabella(assenza) {
    const D = contesto.orario();
    if (Breve.giorniDiScuola(D).some(g => g.iso === assenza.data)) { iso = assenza.data; disegna(); }
    if (!(await attendiAutorizzazione('togliere l\'assenza'))) return;
    await motore.togliAssenzaPerTutti(assenza);
    disegna();
  }

  /*
    Annulla la sostituzione scelta nella tabella (voce di supplenze.js): mostra il suo giorno, aspetta il controllo
    dell'autorizzazione, chiede conferma e poi fa tutto il motore (Sostituzioni.annullaVoce): toglie 1 ora al docente
    che sostituiva nel foglio del conteggio e la riga dal foglio «Sostituzioni», anche se era stata registrata su un
    altro dispositivo. La pubblicazione automatica (pubblica-sostituzioni.js) la fa poi sparire per tutti.
  */
  async function annullaDaTabella(voce) {
    const D = contesto.orario();
    if (Breve.giorniDiScuola(D).some(g => g.iso === voce.data)) { iso = voce.data; disegna(); }
    // il foglio «Autorizzazioni» si controlla da solo: aspetto al massimo 30 secondi
    if (!(await attendiAutorizzazione('annullare la sostituzione'))) return;
    const domanda = `Annullare questa sostituzione?\n\n${motore.dataCorta(voce.data)} · ${motore.testoOra(voce.ora)}\n` +
      `Classe ${motore.nome('classe', voce.classe)} · assente ${motore.nomeDocente(voce.assente)}\n` +
      `Sostituisce: ${motore.nomeDocente(voce.sostituto)}\n\n` +
      `Se l'ora era stata segnata nel foglio del conteggio, a ${motore.nomeDocente(voce.sostituto)} verrà tolta 1 ora.`;
    if (!confirm(domanda)) return;
    await motore.annullaVoce(voce);
    disegna();
  }

  // Da chiamare quando l'orario dell'app cambia o passa il minuto
  function aggiorna() { if (motore && box && !box.hidden) motore.aggiorna(); }

  return { apri, aggiorna, negato };
})();

/*
  brief.js – vista "In breve": la giornata di una classe, di un docente o di un'aula a schede.

  Si apre con il tasto "In breve" nella barra in alto (on demand: la tabella resta com'è).
  Mostra, in quest'ordine:
  1. Adesso: la lezione in corso, con l'AULA in grande e quanto manca alla fine dell'ora.
  2. Dopo:   la lezione successiva e, se l'aula cambia, "spostati da ... a ..."
             (in una scuola DADA sono gli studenti a cambiare aula).
  3. Il resto della giornata, come schede piccole da scorrere.
  I colori della testata cambiano con il momento della giornata (mattina, pomeriggio, sera).
  Nei giorni della settimana in corso si vedono anche le sostituzioni, le assenze, le uscite didattiche e i cambi d'aula
  (gli stessi della tabella, vedi supplenze.js): chi sostituisce trova l'ora in più nella sua giornata, e l'aula
  mostrata è già quella nuova.
*/
const Breve = (() => {
  const esc = s => Viste.esc(s);
  const NOMI_GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  const minuti = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
  // Icona della puntina per l'aula (disegnata in SVG, non viene letta dai lettori di schermo)
  const ICONA_AULA = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>';

  // Momento della giornata in base ai minuti dalla mezzanotte
  const momento = m => m < 13 * 60 ? 'mattina' : m < 18 * 60 ? 'pomeriggio' : 'sera';
  const SALUTI = { mattina: 'Buongiorno', pomeriggio: 'Buon pomeriggio', sera: 'Buonasera' };

  // Data nel formato "2026-09-28" (ora locale, non UTC)
  const isoLocale = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /*
    I prossimi giorni di scuola (da oggi, per circa due settimane), per la tendina delle date:
    [{ iso: "2026-09-28", giorno: "Lunedì", testo: "Domani, lunedì 28 settembre" }]
  */
  function giorniDiScuola(D) {
    const elenco = [], d = new Date();
    for (let i = 0; i < 21 && elenco.length < 12; i++) {
      const giorno = NOMI_GIORNI[d.getDay()];
      if (D.giorni.includes(giorno)) {
        const testo = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        elenco.push({ iso: isoLocale(d), giorno, testo: (i === 0 ? 'Oggi, ' : i === 1 ? 'Domani, ' : '') + testo });
      }
      d.setDate(d.getDate() + 1);
    }
    return elenco;
  }

  // Menu a tendina per scegliere la data
  function sceltaData(elenco, iso) {
    return `<label class="scelta-breve" for="sceltaDataBreve"><span>Giorno</span>
      <select id="sceltaDataBreve">${elenco.map(g =>
        `<option value="${g.iso}"${g.iso === iso ? ' selected' : ''}>${esc(g.testo.charAt(0).toUpperCase() + g.testo.slice(1))}</option>`).join('')}</select></label>`;
  }

  // Menu a tendina per scegliere di chi vedere la giornata (classi, docenti, aule)
  function scelta(D, soggetto) {
    const valore = soggetto ? soggetto.tipo + '|' + soggetto.id : '';
    const gruppo = (tipo, titolo) => `<optgroup label="${titolo}">` +
      D[tipo].map(e => { const v = tipo + '|' + e.id; return `<option value="${esc(v)}"${v === valore ? ' selected' : ''}>${esc(e.nome)}</option>`; }).join('') +
      '</optgroup>';
    return `<label class="scelta-breve" for="sceltaBreve"><span>Giornata di</span>
      <select id="sceltaBreve">${soggetto ? '' : '<option value="" selected>Scegli…</option>'}${gruppo('classe', 'Classi')}${gruppo('docente', 'Docenti')}${gruppo('aula', 'Aule')}</select></label>`;
  }

  // Descrizione di una lezione: le informazioni che non sono già nel "soggetto"
  function dettagli(l, tipo) {
    const parti = [];
    if (tipo !== 'classe' && l.classe) parti.push('classe ' + Dati.nome('classe', l.classe));
    if (tipo !== 'docente' && l.docente) parti.push(Dati.nome('docente', l.docente));
    return parti.join(' · ');
  }

  // L'aula in grande con il segnaposto: se è segnata sulla piantina (piantine.js) diventa un tasto «dov'è»
  function aulaHtml(classe, idAula) {
    const nome = Dati.nome('aula', idAula);
    if (typeof Piantine !== 'undefined' && Piantine.segnata(nome))
      return `<button type="button" class="${classe} link-piantina" data-piantina="${esc(nome)}" title="Dov'è l'aula ${esc(nome)}">${ICONA_AULA}<span class="solo-lettori">Aula (mostra sulla piantina): </span>${esc(nome)}</button>`;
    return `<span class="${classe}">${ICONA_AULA}<span class="solo-lettori">Aula: </span>${esc(nome)}</span>`;
  }

  /*
    Sostituzioni della settimana (supplenze.js) per il giorno mostrato: sost = Supplenze.settimana, oppure null se il
    giorno non è nella settimana in corso. Per ogni lezione: l'aula giusta (quella nuova se c'è un cambio d'aula) e una
    riga che spiega cosa succede (sostituzione, docente assente, uscita didattica, aula cambiata).
  */
  let sost = null;
  const cambio = l => (sost && Supplenze.cambioAula(sost, l)) || null;
  const aulaDi = l => { const c = cambio(l); return c ? c.a : l.aula; };
  function notaSost(l) {
    const s = sost && Supplenze.di(sost, l);
    const c = cambio(l);
    const nome = id => esc(Dati.nome('docente', id));
    let nota = '';
    const sc = s && Supplenze.testoSciopero && Supplenze.testoSciopero(s, id => Dati.nome('docente', id));
    // sciopero / assemblea: con la classe che non c'è solo «Nessuna lezione» (la parola «sciopero» non si vede)
    if (sc) nota = sc.etichetta ? `${esc(sc.etichetta)}: ${esc(sc.riga)}` : 'Nessuna lezione';
    else if (s && s.uscita) nota = '🚌 Uscita didattica: la classe è fuori, lezione non svolta';
    else if (s && s.copia) nota = `🔄 Sostituisci ${nome(s.assente)}`;
    else if (s && s.sostituto) nota = `🔄 ${nome(s.assente)} assente → sostituisce <b>${nome(s.sostituto)}</b>`;
    else if (s) nota = `⚠ ${nome(s.assente)} assente · sostituto da trovare`;
    const tipo = s && (s.uscita || s.sciopero) ? ' uscita' : s && !s.sostituto && !s.copia ? ' scoperta' : '';
    return (nota ? `<p class="nota-sost-breve${tipo}">${nota}</p>` : '') +
      (c ? `<p class="nota-sost-breve cambio">⇄ Aula cambiata${c.da ? ` (era ${esc(Dati.nome('aula', c.da))})` : ''}</p>` : '');
  }

  // Scheda grande (Adesso / Dopo) con una o più lezioni della stessa ora (compresenze)
  function scheda(classe, etichetta, orario, lezioni, tipo, extra) {
    const righe = lezioni.map(l => `
      <div class="riga-breve"><span class="materia-breve">${esc(l.materia || '—')}</span><span class="dettagli-breve">${esc(dettagli(l, tipo))}</span></div>
      ${tipo !== 'aula' && aulaDi(l) ? aulaHtml('aula-breve', aulaDi(l)) : ''}${notaSost(l)}`).join('');
    return `<article class="scheda-breve ${classe}">
      <div class="riga-breve"><span class="pill-breve">${etichetta}</span><span class="dettagli-breve">${esc(orario)}</span></div>
      ${righe}${extra || ''}</article>`;
  }

  /*
    Disegna la vista nell'elemento indicato.
    c = { D, adesso: { giorno, ora, minuto }, giorno, avviso, soggetto: { tipo, id } | null, nomeUtente, eIo, data }
    - giorno: il giorno proposto dall'app (oggi, o il prossimo giorno di scuola)
    - data: la data scelta nella tendina "Giorno" ("2026-09-28"), oppure '' per usare il giorno proposto
  */
  function disegna(el, c) {
    const { D, adesso, soggetto } = c;
    const mom = momento(adesso.minuto);
    // Giorno mostrato: la data scelta nella tendina, altrimenti il primo giorno di scuola uguale a quello proposto
    const elenco = giorniDiScuola(D);
    const scelto = (c.data && elenco.find(g => g.iso === c.data)) || elenco.find(g => g.giorno === c.giorno) || elenco[0] ||
      { iso: '', giorno: c.giorno, testo: c.giorno };
    const giorno = scelto.giorno;
    const oggi = scelto.iso === isoLocale(new Date());
    const avviso = c.data ? '' : c.avviso;   // l'avviso "lezioni finite…" serve solo per il giorno proposto
    const nomeOra = o => `${o.n}ª ora · ${o.inizio}–${o.fine}`;
    const oraDi = n => D.ore.find(o => o.n === n);

    // Testata con saluto e data
    const nome = c.eIo ? ', ' + String(c.nomeUtente).split(/\s+/)[0] : '';
    let html = `<div class="testata-breve" data-momento="${mom}">
      <div class="riga-testata"><span class="marchio-breve">In breve</span>
        <button type="button" id="btnChiudiBreve" class="pulsante pulsante-tabella">Tabella</button></div>
      <h2 id="titoloBreve">${SALUTI[mom]}${esc(nome)}</h2>
      <p class="data-breve">${esc(scelto.testo)}</p>
      ${avviso ? `<p class="avviso-breve">${esc(avviso)}</p>` : ''}
      <div class="scelte-breve">${scelta(D, soggetto)}${elenco.length ? sceltaData(elenco, scelto.iso) : ''}</div>
    </div><div class="schede-breve">`;

    if (!soggetto) {
      html += '<article class="scheda-breve"><p class="vuoto-breve">Scegli qui sopra una classe, un docente o un’aula per vedere la sua giornata.</p></article></div>';
      el.innerHTML = html;
      return;
    }

    // Sostituzioni: solo se il giorno mostrato è nella settimana in corso (quella di Supplenze.settimana).
    // Chi sostituisce ha un'ora in più: le "copie" delle lezioni (extra) si aggiungono solo guardando un docente
    sost = c.sostituzioni && c.sostituzioni.date && c.sostituzioni.date.get(giorno) === scelto.iso ? c.sostituzioni : null;
    const tutte = sost && soggetto.tipo === 'docente' ? D.lezioni.concat(sost.extra) : D.lezioni;

    // Lezioni del giorno per questo soggetto, raggruppate per ora
    const perOra = new Map();
    tutte.filter(l => l.giorno === giorno && l[soggetto.tipo] === soggetto.id).forEach(l => {
      if (!perOra.has(l.ora)) perOra.set(l.ora, []);
      perOra.get(l.ora).push(l);
    });
    const numeri = [...perOra.keys()].sort((a, b) => a - b);
    const nomeSoggetto = Dati.nome(soggetto.tipo, soggetto.id);

    if (!numeri.length) {
      html += `<article class="scheda-breve"><p class="vuoto-breve">Nessuna lezione per ${esc(nomeSoggetto)} in questo giorno.</p></article></div>`;
      el.innerHTML = html;
      return;
    }

    // 1. Adesso
    if (oggi && adesso.ora) {
      const o = oraDi(adesso.ora);
      const inizio = minuti(o.inizio), fine = minuti(o.fine);
      const mancano = Math.max(0, fine - adesso.minuto);
      const percento = Math.min(100, Math.max(0, Math.round((adesso.minuto - inizio) / (fine - inizio) * 100)));
      const tempo = `<div class="tempo-breve"><div class="barra-tempo" role="progressbar" aria-label="Ora in corso" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percento}"><i style="width:${percento}%"></i></div>
        <span class="dettagli-breve">mancano ${mancano} min</span></div>`;
      const inCorso = perOra.get(adesso.ora);
      if (inCorso) html += scheda('scheda-adesso', 'Adesso', nomeOra(o), inCorso, soggetto.tipo, tempo);
      else if (adesso.ora > numeri[0] && adesso.ora < numeri[numeri.length - 1]) {
        html += `<article class="scheda-breve scheda-adesso"><div class="riga-breve"><span class="pill-breve">Adesso</span><span class="dettagli-breve">${esc(nomeOra(o))}</span></div>
          <span class="materia-breve">Ora libera</span>${tempo}</article>`;
      }
    }

    // 2. Dopo: la prima ora con lezioni che non è ancora cominciata
    const future = numeri.filter(n => !oggi || minuti(oraDi(n).inizio) > adesso.minuto);
    if (future.length) {
      const n = future[0], o = oraDi(n), prossime = perOra.get(n);
      let etichetta = 'Prima lezione';
      if (oggi && adesso.ora) etichetta = 'Dopo';
      else if (oggi) etichetta = 'Tra ' + (minuti(o.inizio) - adesso.minuto) + ' min';
      // In DADA si cambia aula: confronto con l'aula dell'ultima lezione prima di questa
      let sposta = '';
      const prima = oggi ? numeri.filter(x => x < n && minuti(oraDi(x).inizio) <= adesso.minuto).pop() : null;
      if (soggetto.tipo !== 'aula' && prima) {
        const da = aulaDi(perOra.get(prima)[0]), a = aulaDi(prossime[0]);
        // La freccia non viene letta: al suo posto i lettori di schermo dicono "verso"
        if (da && a && da !== a) sposta = `<p class="spostati-breve">Al cambio dell’ora si cambia aula: <b>${esc(Dati.nome('aula', da))}</b> <span aria-hidden="true">→</span><span class="solo-lettori">verso</span> <b>${esc(Dati.nome('aula', a))}</b></p>`;
      }
      html += scheda('scheda-dopo', etichetta, nomeOra(o), prossime, soggetto.tipo, sposta);
    } else if (oggi) {
      html += '<article class="scheda-breve"><p class="vuoto-breve">Lezioni di oggi finite. Buon riposo!</p></article>';
    }
    html += '</div>';

    // 3. Il resto della giornata: dalla prima all'ultima ora con lezioni (le ore vuote sono "libere")
    const ore = D.ore.filter(o => o.n >= numeri[0] && o.n <= numeri[numeri.length - 1]);
    html += `<h3 class="titoletto-breve">${oggi ? 'Il resto della giornata' : 'La giornata'}</h3><ol class="giornata-breve">` + ore.map(o => {
      const lez = perOra.get(o.n) || [];
      const fatta = oggi && minuti(o.fine) <= adesso.minuto;
      const ora = oggi && adesso.ora === o.n;
      const stato = [lez.length ? '' : 'libera', fatta ? 'fatta' : '', ora ? 'in-corso' : ''].filter(Boolean).join(' ');
      // Etichetta dello stato dell'ora (a destra, come la pillola "Adesso")
      const pill = ora ? '<span class="pill-breve">In corso</span>' : fatta ? '<span class="pill-ora">Fatta</span>' : !lez.length ? '<span class="pill-ora">Libera</span>' : '';
      // Ogni ora è una scheda grande come "Adesso" e "Dopo": materia, docente/classe e aula
      const testo = lez.length
        ? lez.map(l => `
          <div class="riga-breve"><span class="materia-breve">${esc(l.materia || '—')}</span><span class="dettagli-breve">${esc(dettagli(l, soggetto.tipo))}</span></div>
          ${soggetto.tipo !== 'aula' && aulaDi(l) ? aulaHtml('aula-ora', aulaDi(l)) : ''}${notaSost(l)}`).join('')
        : '<span class="materia-breve">Ora libera</span>';
      return `<li class="scheda-breve scheda-ora ${stato}">
        <div class="riga-breve"><span class="dettagli-breve">${esc(`${o.n}ª ora · ${o.inizio}–${o.fine}`)}</span>${pill}</div>${testo}</li>`;
    }).join('') + '</ol>';

    el.innerHTML = html;
  }

  return { disegna, momento, giorniDiScuola };
})();

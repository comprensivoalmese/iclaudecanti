/*
  viste.js – disegna la tabella dell'orario.

  La tabella ha sempre le ORE in riga. In colonna si sceglie una variabile:
  CLASSI, DOCENTI, AULE oppure GIORNI (la settimana).
  I filtri (classe, docente, aula) si possono combinare tra loro liberamente.
*/
const Viste = (() => {
  const DIMENSIONI = {
    classe:  { singolare: 'Classe',  plurale: 'Classi' },
    docente: { singolare: 'Docente', plurale: 'Docenti' },
    aula:    { singolare: 'Aula',    plurale: 'Aule' },
    giorno:  { singolare: 'Giorno',  plurale: 'Giorni' }
  };
  const FILTRI = ['classe', 'docente', 'aula'];

  // Evita che testi presi dai dati vengano interpretati come HTML
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Un colore diverso per ogni materia: le materie vengono messe in ordine alfabetico
  // e distanziate sul cerchio dei colori (angolo aureo), così colori vicini non si ripetono
  const tinte = new WeakMap();
  function tinta(D, materia) {
    if (!tinte.has(D)) {
      const mappa = new Map();
      [...new Set(D.lezioni.map(l => l.materia))].sort().forEach((m, i) => mappa.set(m, Math.round((i * 137.508 + 200) % 360)));
      tinte.set(D, mappa);
    }
    const m = tinte.get(D);
    // materia comparsa dopo (per esempio una compresenza aggiunta con il quadratino): le si dà il colore successivo
    if (!m.has(materia)) m.set(materia, Math.round((m.size * 137.508 + 200) % 360));
    return m.get(materia);
  }

  // Lezioni che rispettano giorno (se serve) e filtri attivi.
  // Le ore di sostituzione (supplenze.js) si aggiungono all'orario del docente che sostituisce solo quando
  // i docenti si vedono uno per uno (colonne "Docenti" o filtro su un docente): altrimenti comparirebbero due volte
  function lezioniFiltrate(D, stato) {
    const perDocente = stato.colonne === 'docente' || !!stato.filtri.docente;
    const tutte = stato.sostituzioni && perDocente ? D.lezioni.concat(stato.sostituzioni.extra) : D.lezioni;
    return tutte.filter(l =>
      (stato.colonne === 'giorno' || l.giorno === stato.giorno) &&
      FILTRI.every(k => !stato.filtri[k] || l[k] === stato.filtri[k]));
  }

  // Le colonne da mostrare
  function colonne(D, stato, lezioni) {
    if (stato.colonne === 'giorno') return D.giorni.map(g => ({ id: g, nome: g }));
    const k = stato.colonne;
    let elenco = D[k];
    if (stato.filtri[k]) elenco = elenco.filter(e => e.id === stato.filtri[k]);
    // Con filtri su altre variabili, tengo solo le colonne che hanno almeno una lezione
    const altriFiltri = FILTRI.some(f => f !== k && stato.filtri[f]);
    if (altriFiltri) elenco = elenco.filter(e => lezioni.some(l => l[k] === e.id));
    // Schermo all'ingresso: solo le colonne della pagina che si sta mostrando (vedi ingresso.js)
    if (stato.pagina) elenco = elenco.filter(e => stato.pagina.ids.includes(e.id));
    return elenco;
  }

  // Contenuto di una cella: materia + le informazioni che non sono già nella colonna
  function cella(D, lezioniCella, stato) {
    return lezioniCella.map(l => {
      const righe = FILTRI
        .filter(k => k !== stato.colonne && !stato.filtri[k])
        .map(k => {
          const nome = Dati.nome(k, l[k]);
          // un'aula segnata sulla piantina (piantine.js) diventa un tasto: toccandolo si vede dov'è
          if (k === 'aula' && typeof Piantine !== 'undefined' && Piantine.segnata(nome))
            return `<button type="button" class="dato dato-aula link-piantina" data-piantina="${esc(nome)}" title="Dov'è l'aula ${esc(nome)}"><span class="solo-lettori">Aula (mostra sulla piantina): </span>${esc(nome)}</button>`;
          return `<span class="dato dato-${k}"><span class="solo-lettori">${DIMENSIONI[k].singolare}: </span>${esc(nome)}</span>`;
        })
        .join('');
      // Lezione cambiata all'ultimo minuto (vedi modifiche.js): bordo evidenziato ed etichetta
      const cambiata = stato.modificate && stato.modificate.has(l.giorno + '|' + l.ora + '|' + l.classe);
      // Docente assente o sostituito questa settimana (vedi supplenze.js): cornice colorata, etichetta e nomi
      const sost = Supplenze.di(stato.sostituzioni, l);
      let classeSost = '', etichettaSost = '', rigaSost = '';
      if (sost && sost.uscita) {
        // la classe è fuori per un'uscita didattica (sostituzioni/js/uscite.js): la lezione non si fa
        classeSost = ' lezione-uscita';
        etichettaSost = '<span class="etichetta-sost">🚌 Uscita didattica</span>';
        rigaSost = '<span class="dato-sost">la classe è fuori: lezione non svolta</span>';
      } else if (sost && sost.copia) {
        classeSost = ' lezione-supplenza lezione-copia';
        etichettaSost = '<span class="etichetta-sost">🔄 Sostituzione</span>';
        rigaSost = `<span class="dato-sost">al posto di ${esc(Dati.nome('docente', sost.assente))}</span>`;
      } else if (sost && sost.sostituto) {
        classeSost = ' lezione-supplenza';
        etichettaSost = '<span class="etichetta-sost">🔄 Sostituzione</span>';
        rigaSost = `<span class="dato-sost">${esc(Dati.nome('docente', sost.assente))} assente → <b>${esc(Dati.nome('docente', sost.sostituto))}</b></span>`;
      } else if (sost) {
        classeSost = ' lezione-scoperta';
        etichettaSost = '<span class="etichetta-sost">⚠ Docente assente</span>';
        rigaSost = `<span class="dato-sost">${esc(Dati.nome('docente', sost.assente))} · sostituto da trovare</span>`;
      }
      // Chi è autorizzato alle sostituzioni può annullarle da qui: app.js apre la pagina Sostituzioni, che chiede conferma,
      // toglie l'ora dal foglio del conteggio e la riga dal foglio «Sostituzioni» (Sostituzioni.annullaVoce)
      if (sost && sost.sostituto && sost.voce && stato.puoAnnullare) {
        const v = sost.voce;
        rigaSost += `<button type="button" class="annulla-sost" data-annulla-sost="${esc([v.id || '', v.data, v.ora, v.classe].join('|'))}"
          aria-label="Annulla la sostituzione della ${l.ora}ª ora in ${esc(Dati.nome('classe', l.classe))} (sostituisce ${esc(Dati.nome('docente', sost.sostituto))})">✕ Annulla</button>`;
      }
      // Cambio d'aula di questa settimana (sostituzioni/js/cambi-aula.js): etichetta e nuova aula ben visibili
      const cambio = Supplenze.cambioAula(stato.sostituzioni, l);
      const etichettaCambio = cambio ? '<span class="etichetta-cambio">⇄ Aula cambiata</span>' : '';
      const rigaCambio = cambio ? `<span class="dato-cambio">aula ${cambio.da ? esc(Dati.nome('aula', cambio.da)) + ' → ' : ''}<b>${esc(Dati.nome('aula', cambio.a))}</b></span>` : '';
      // Ora di compresenza (vedi compresenze.js): etichetta e bordo tratteggiato
      const etichettaCompresenza = l.compresenza ? '<span class="etichetta-compresenza">＋ Compresenza</span>' : '';
      return `<div class="lezione${cambiata ? ' lezione-modificata' : ''}${classeSost}${cambio ? ' lezione-cambio-aula' : ''}${l.compresenza ? ' lezione-compresenza' : ''}" style="--tinta:${tinta(D, l.materia)}">` +
        (cambiata ? '<span class="etichetta-modificata">Cambiata</span>' : '') + etichettaSost + etichettaCambio + etichettaCompresenza +
        `<strong class="materia">${esc(l.materia || '—')}</strong>${righe}${rigaSost}${rigaCambio}</div>`;
    }).join('');
  }

  // Titolo della tabella, es. "Martedì · Classi · docente Anna Rossi"
  function descrizione(stato) {
    const parti = [stato.colonne === 'giorno' ? 'Settimana' : stato.giorno];
    const filtri = FILTRI.filter(k => stato.filtri[k]).map(k => DIMENSIONI[k].singolare.toLowerCase() + ' ' + Dati.nome(k, stato.filtri[k]));
    // Il nome delle colonne serve solo se non è già chiaro (es. "Classi" senza filtro sulla classe)
    if (stato.colonne !== 'giorno' && !stato.filtri[stato.colonne]) {
      const p = stato.pagina;
      parti.push(DIMENSIONI[stato.colonne].plurale + (p && p.totale > 1 ? ` (${p.numero} di ${p.totale})` : ''));
    }
    return parti.concat(filtri).join(' · ');
  }

  /*
    Disegna la tabella nell'elemento indicato.
    adesso = { giorno, ora } serve per evidenziare l'ora in corso.
    Restituisce il numero di lezioni mostrate.
  */
  function disegna(tabella, D, stato, adesso) {
    const lezioni = lezioniFiltrate(D, stato);
    const cols = colonne(D, stato, lezioni);
    const giornoCol = c => stato.colonne === 'giorno' ? c.id : stato.giorno;
    // Indice veloce: "giorno|ora|colonna" -> lezioni
    const indice = new Map();
    lezioni.forEach(l => {
      const chiave = (stato.colonne === 'giorno' ? l.giorno : l[stato.colonne]) + '|' + l.ora;
      if (!indice.has(chiave)) indice.set(chiave, []);
      indice.get(chiave).push(l);
    });

    let html = `<caption id="didascalia">${esc(descrizione(stato))}</caption><thead><tr><th scope="col" class="angolo">Ora</th>`;
    cols.forEach(c => {
      const oggi = stato.colonne === 'giorno' && adesso && c.id === adesso.giorno;
      html += `<th scope="col"${oggi ? ' class="col-oggi"' : ''}>${esc(c.nome)}${oggi ? ' <span class="etichetta-oggi">oggi</span>' : ''}</th>`;
    });
    html += '</tr></thead><tbody>';
    D.ore.forEach(o => {
      const rigaCorrente = adesso && adesso.ora === o.n && stato.colonne !== 'giorno' && stato.giorno === adesso.giorno;
      html += `<tr${rigaCorrente ? ' class="ora-corrente"' : ''}><th scope="row"><span class="num-ora">${o.n}ª</span><span class="orario-ora">${esc(o.inizio)}–${esc(o.fine)}</span>${rigaCorrente ? '<span class="solo-lettori"> (ora in corso)</span>' : ''}</th>`;
      cols.forEach(c => {
        const corrente = adesso && adesso.ora === o.n && giornoCol(c) === adesso.giorno;
        const contenuto = indice.get(c.id + '|' + o.n) || [];
        html += `<td${corrente ? ' class="cella-corrente"' : ''}>${cella(D, contenuto, stato)}</td>`;
      });
      html += '</tr>';
    });
    tabella.innerHTML = html + '</tbody>';
    tabella.dataset.colonne = cols.length;
    return lezioni.length;
  }

  // Riquadro "adesso / dopo" quando si guarda un solo docente, classe o aula.
  // adesso = { giorno, ora, minuto }: giorno e ora di scuola in questo momento.
  function riquadroAdesso(D, stato, adesso) {
    if (stato.colonne === 'giorno' || !FILTRI.some(k => stato.filtri[k])) return '';
    const delGiorno = D.lezioni.filter(l => l.giorno === stato.giorno && FILTRI.every(k => !stato.filtri[k] || l[k] === stato.filtri[k]));
    const descrivi = l => [l.materia]
      .concat(FILTRI.filter(k => !stato.filtri[k]).map(k => Dati.nome(k, l[k])))
      .filter(Boolean).map(esc).join(' · ');
    const minutiInizio = n => { const o = D.ore.find(x => x.n === n); const [h, m] = (o ? o.inizio : '0:0').split(':').map(Number); return h * 60 + m; };
    const blocco = (classe, etichetta, lezioni) =>
      `<div class="${classe}"><span class="etichetta">${etichetta}</span><span class="valore">${lezioni.length ? lezioni.map(descrivi).join('<br>') : 'Nessuna lezione'}</span></div>`;
    const etichettaOra = n => { const o = D.ore.find(x => x.n === n); return `${n}ª ora (${esc(o ? o.inizio : '')})`; };

    // Si guarda un altro giorno (es. domani): mostro solo la prima lezione di quel giorno
    const oggi = adesso && adesso.giorno === stato.giorno;
    const future = oggi ? delGiorno.filter(l => minutiInizio(l.ora) > adesso.minuto) : delGiorno;
    const nProssima = future.length ? Math.min(...future.map(l => l.ora)) : null;
    const prossime = future.filter(l => l.ora === nProssima);
    let html = '';
    if (oggi && adesso.ora) {
      html += blocco('blocco-adesso', 'Adesso · ' + etichettaOra(adesso.ora), delGiorno.filter(l => l.ora === adesso.ora));
    }
    if (prossime.length) {
      const titolo = oggi ? (adesso.ora ? 'Dopo' : 'Prima lezione') : 'Prima lezione di ' + esc(stato.giorno.toLowerCase());
      html += blocco('blocco-dopo', titolo + ' · ' + etichettaOra(nProssima), prossime);
    } else if (oggi && adesso.ora) {
      html += '<div class="blocco-dopo"><span class="etichetta">Dopo</span><span class="valore">Nessun’altra lezione oggi</span></div>';
    }
    return html;
  }

  return { disegna, riquadroAdesso, DIMENSIONI, FILTRI, esc };
})();

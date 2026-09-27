/*
  compresenze-pagina.js – pagina «Compresenze» dell'app Luis@i: la maschera per inserire le ore di compresenza.

  Si apre con il tasto «✎ Modifica» accanto al quadratino «Compresenze» o dal menu (voce «Compresenze»), solo per chi
  può modificare l'orario. Legge e scrive il Foglio Google «Compresenze» (CONFIG.fileCompresenze) con il permesso
  Google di chi la usa: per salvare bisogna poter modificare quel Foglio su Drive.

  Le ore sono divise in gruppi (potenziamento L2, Alternativa, ore eccedenti, completamento…). I gruppi di OGNI SCUOLA,
  con le ore previste e i docenti previsti, stanno nella scheda «Gruppi» del Foglio (si modificano dalla pagina, riquadro
  «Gruppi e ore previste»); se la scheda non c'è si parte dai gruppi proposti in CONFIG.gruppiCompresenze, senza numeri.
  Un gruppo «nelle ore di» una materia (Alternativa → Religione) conta da solo le ore previste nell'orario.
  Ogni ora è di un docente: docente, classe, giorno, ora e aula (vuota = aula del titolare).
  Per ogni ora la pagina controlla che la classe abbia lezione, che il docente sia libero e (Alternativa) che in quell'ora
  ci sia la materia in parallelo. Le ore con un tipo che non è in nessun gruppo stanno in «Altre compresenze».
  Nel Foglio, accanto al codice, si scrive anche il nome del docente (solo se è stato caricato): i nomi veri stanno solo
  su Drive, mai su GitHub né sul dispositivo.
*/
const PaginaCompresenze = (() => {
  const esc = s => Viste.esc(s);
  const semplice = s => Compresenze.semplice(s);
  const SCRIVERE = 'https://www.googleapis.com/auth/spreadsheets';
  const TITOLI = ['Codice docente', 'Classe', 'Giorno', 'Ora', 'Tipo', 'Aula', 'Docente (non letto dall\'app)', 'Note'];
  const ALTRE = '__altre';

  let box = null;         // l'elemento della pagina
  let ctx = null;         // { orario(), email, chiudi(), applica() }
  let righe = [];         // tutte le righe del Foglio: { codice, classe, giorno, ora, tipo, aula, note, nome }
  let stato = 'carico';   // 'carico' | 'pronto' | 'errore'
  let errore = '';
  let modificato = false; // ci sono modifiche non ancora salvate
  let salvo = false;      // salvataggio in corso
  let messaggio = '';
  let permesso = null;    // Promise del permesso Google (chiesto subito, al tocco)
  // i gruppi di questa scuola, letti dalla scheda «Gruppi» del Foglio (null = scheda assente: si usano quelli proposti)
  // { tipo, previste (numero o ''), docenti: [{ codice, ore }], nelleOreDi, spiegazione, altriNomi }
  let gruppiScuola = null;
  let gruppiAperti = null;   // riquadro «Gruppi e ore previste» aperto (null = aperto solo se la scheda «Gruppi» non c'è ancora)
  let gruppiDalFoglio = false;   // true se i gruppi sono stati letti dalla scheda «Gruppi»
  const TITOLI_GRUPPI = ['Tipo', 'Ore previste', 'Docenti previsti (es. DOC08:1, DOC19:2)', 'Nelle ore di (materia in parallelo)', 'Spiegazione'];

  const proposti = () => ((typeof CONFIG !== 'undefined' && CONFIG.gruppiCompresenze) || [])
    .map(g => ({ tipo: g.tipo, previste: g.previste || '', docenti: g.docenti || [], nelleOreDi: g.nelleOreDi || '', spiegazione: g.spiegazione || '', altriNomi: g.altriNomi || [] }));
  const gruppi = () => gruppiScuola || (gruppiScuola = proposti());
  const gruppoDi = tipo => gruppi().find(g => semplice(g.tipo) === semplice(tipo) || (g.altriNomi || []).some(n => semplice(n) === semplice(tipo)));
  const D = () => ctx.orario();
  const codiceDi = e => String(e.codice !== undefined ? e.codice : e.nome).trim().toUpperCase();
  const curricolari = () => { const d = D(); return d.lezioniCurricolari || d.lezioni.filter(l => !l.compresenza); };
  // le lezioni della materia in parallelo (es. tutte le ore di Religione), per i gruppi «nelle ore di»
  const lezioniDi = materia => curricolari().filter(l => semplice(l.materia).includes(semplice(materia)));
  // ore previste di un gruppo: quelle scritte; se mancano e il gruppo è «nelle ore di» una materia, quante ore ha quella materia
  function previsteDi(g) {
    if (g.previste !== '' && g.previste != null && !isNaN(Number(g.previste))) return Number(g.previste);
    return g.nelleOreDi ? lezioniDi(g.nelleOreDi).length : null;
  }
  // "DOC08:1, DOC19:2" <-> [{ codice, ore }]
  const leggiDocenti = testo => String(testo || '').split(/[,;]/).map(x => x.trim()).filter(Boolean).map(x => {
    const [c, o] = x.split(/[:=]/); return { codice: String(c).trim().toUpperCase(), ore: parseInt(o, 10) || 1 };
  });
  const scriviDocenti = elenco => (elenco || []).map(x => x.codice + ':' + x.ore).join(', ');

  // Nome da mostrare per un codice (il nome vero se è stato caricato, altrimenti il codice)
  function nomeDoc(codice) {
    const e = D().docente.find(x => codiceDi(x) === codice);
    return e ? e.nome : codice;
  }
  const nomeVero = codice => { const n = nomeDoc(codice); return n && n !== codice ? n : ''; };

  /* ---------- Google: lettura e scrittura del Foglio ---------- */
  const base = () => 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(CONFIG.fileCompresenze);
  function spiega(stato, testo) {
    if (stato === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(testo)) return 'nel progetto Google Cloud va attivata la "Google Sheets API"';
    if (stato === 403) return 'il tuo account non ha il permesso di modificare il Foglio Compresenze';
    if (stato === 404) return 'Foglio Compresenze non trovato (è un Foglio Google? l\'ID in config.js è giusto?)';
    if (stato === 401) return 'il permesso di Google è scaduto: chiudi e riapri la pagina';
    if (stato === 400 && /Unable to parse range/i.test(testo)) return 'il file non è un Foglio Google: aprilo e scegli File → Salva come Fogli Google';
    return 'errore ' + stato + ' da Google';
  }
  async function chiama(t, percorso, opzioni) {
    const r = await fetch(base() + percorso, Object.assign({ headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' } }, opzioni || {}));
    if (!r.ok) throw new Error(spiega(r.status, await r.text()));
    return r.json();
  }

  async function carica() {
    stato = 'carico'; messaggio = ''; disegna();
    try {
      if (!CONFIG.fileCompresenze) throw new Error('in config.js manca l\'ID del Foglio Compresenze (fileCompresenze)');
      const t = await permesso;
      // senza nome del foglio si legge il PRIMO foglio del file
      const j = await chiama(t, '/values/' + encodeURIComponent('A1:Z1000'));
      const tab = j.values && j.values.length ? j.values : [TITOLI];
      righe = Compresenze.righeDaTabella(tab);
      // la scheda «Gruppi» (se non c'è ancora, si parte da quelli proposti e la si crea al primo salvataggio)
      gruppiScuola = null; gruppiDalFoglio = false;
      try {
        const gj = await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:E100"));
        const gr = (gj.values || []).slice(1).filter(r => String(r[0] || '').trim());
        if (gr.length) {
          gruppiScuola = gr.map(r => {
            const tipo = String(r[0]).trim(), p = proposti().find(x => semplice(x.tipo) === semplice(tipo));
            return { tipo, previste: String(r[1] || '').trim(), docenti: leggiDocenti(r[2]), nelleOreDi: String(r[3] || '').trim(),
              spiegazione: String(r[4] || '').trim(), altriNomi: p ? p.altriNomi : [] };
          });
          gruppiDalFoglio = true;
        }
      } catch (e) { /* scheda «Gruppi» assente: gruppi proposti */ }
      // i vecchi nomi del tipo (es. «Tempo prolungato») diventano quelli del gruppo
      righe.forEach(r => { const g = gruppoDi(r.tipo); if (g) r.tipo = g.tipo; });
      modificato = false; stato = 'pronto';
    } catch (e) {
      stato = 'errore'; errore = String(e && e.message || e);
    }
    disegna();
  }

  async function salva() {
    if (salvo) return;
    salvo = true; messaggio = 'Salvo sul Foglio…'; disegna();
    try {
      const t = await NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, SCRIVERE], ctx.email);
      // il nome del primo foglio, per cancellare e riscrivere solo quello
      const info = await chiama(t, '?fields=sheets.properties(title,index)');
      const schede = (info.sheets || []).map(s => s.properties).sort((a, b) => a.index - b.index);
      const primo = schede[0];
      const foglio = "'" + String(primo ? primo.title : 'Compresenze').replace(/'/g, "''") + "'";
      const valori = [TITOLI].concat(righe.map(r => [r.codice, r.classe, r.giorno, r.ora === '' ? '' : Number(r.ora), r.tipo, r.aula,
        nomeVero(r.codice) || r.nome || '', r.note]));
      await chiama(t, '/values/' + encodeURIComponent(foglio + '!A1:Z1000') + ':clear', { method: 'POST', body: '{}' });
      await chiama(t, '/values/' + encodeURIComponent(foglio + '!A1:H' + valori.length) + '?valueInputOption=RAW',
        { method: 'PUT', body: JSON.stringify({ values: valori }) });
      // la scheda «Gruppi» con i gruppi e le ore previste di questa scuola (creata se manca, mai come prima scheda)
      if (!schede.some(s => s.title === 'Gruppi')) {
        await chiama(t, ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Gruppi', index: schede.length } } }] }) });
      }
      const valGruppi = [TITOLI_GRUPPI].concat(gruppi().map(g => [g.tipo, g.previste === '' ? '' : Number(g.previste), scriviDocenti(g.docenti), g.nelleOreDi, g.spiegazione]));
      await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:E100") + ':clear', { method: 'POST', body: '{}' });
      await chiama(t, '/values/' + encodeURIComponent("'Gruppi'!A1:E" + valGruppi.length) + '?valueInputOption=RAW',
        { method: 'PUT', body: JSON.stringify({ values: valGruppi }) });
      Compresenze.imposta(righe);
      ctx.applica();   // la tabella dell'app usa subito le ore nuove
      modificato = false;
      messaggio = '✓ Salvato sul Foglio Compresenze.';
    } catch (e) {
      messaggio = '⚠️ Non salvato: ' + String(e && e.message || e) + '.';
    }
    salvo = false;
    disegna();
  }

  /* ---------- controlli di una riga ---------- */
  function controlli(r) {
    const d = D(), manca = [];
    if (!r.codice) manca.push('docente');
    if (!r.classe) manca.push('classe');
    if (!r.giorno) manca.push('giorno');
    if (!r.ora) manca.push('ora');
    if (manca.length) return { avvisi: ['Da completare: manca ' + manca.join(', ') + '.'], info: '', incompleta: true };
    const avvisi = [];
    const classe = d.classe.find(c => semplice(c.nome) === semplice(r.classe));
    const docente = d.docente.find(e => codiceDi(e) === r.codice);
    const ora = Number(r.ora);
    if (!classe) avvisi.push(`La classe ${r.classe} non è nell'orario.`);
    if (!docente) avvisi.push(`Il docente ${r.codice} non è nell'orario.`);
    let info = '';
    if (classe) {
      const t = curricolari().find(l => l.giorno === r.giorno && l.ora === ora && l.classe === classe.id);
      if (!t) avvisi.push(`In quell'ora la ${r.classe} non ha lezione.`);
      else {
        info = `In classe: ${t.materia || '—'} · ${Dati.nome('docente', t.docente)} · aula ${Dati.nome('aula', t.aula)}`;
        const g = gruppoDi(r.tipo);
        if (g && g.nelleOreDi && !semplice(t.materia).includes(semplice(g.nelleOreDi))) avvisi.push(`In quell'ora la classe non ha ${g.nelleOreDi}.`);
      }
    }
    if (docente) {
      const impegno = curricolari().find(l => l.giorno === r.giorno && l.ora === ora && l.docente === docente.id);
      if (impegno) avvisi.push(`In quell'ora ${nomeDoc(r.codice)} ha già lezione in ${Dati.nome('classe', impegno.classe)}.`);
      const doppie = righe.filter(x => x !== r && x.codice === r.codice && x.giorno === r.giorno && Number(x.ora) === ora);
      if (doppie.length) avvisi.push('Il docente ha già un\'altra compresenza in quest\'ora.');
    }
    return { avvisi, info, incompleta: false };
  }

  /* ---------- disegno ---------- */
  function opzioni(elenco, scelto, vuota) {
    return (vuota !== undefined ? `<option value="">${esc(vuota)}</option>` : '') +
      elenco.map(o => `<option value="${esc(o.v)}"${String(o.v) === String(scelto) ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
  }

  function rigaHtml(r, i, g) {
    const d = D();
    const docenti = d.docente.map(e => ({ v: codiceDi(e), t: e.nome === codiceDi(e) ? e.nome : `${e.nome} (${codiceDi(e)})` }))
      .sort((a, b) => a.t.localeCompare(b.t, 'it'));
    // un docente scritto nel Foglio ma non (più) nell'orario resta scelto, così non si perde
    if (r.codice && !docenti.some(x => x.v === r.codice)) docenti.unshift({ v: r.codice, t: r.codice + ' (non nell\'orario)' });
    const classi = d.classe.map(c => ({ v: c.nome, t: c.nome }));
    if (r.classe && !classi.some(x => semplice(x.v) === semplice(r.classe))) classi.unshift({ v: r.classe, t: r.classe });
    const giorni = d.giorni.map(x => ({ v: x, t: x }));
    const ore = d.ore.map(o => ({ v: o.n, t: `${o.n}ª (${o.inizio})` }));
    const aule = d.aula.map(a => ({ v: a.nome, t: a.nome }));
    if (r.aula && !aule.some(x => semplice(x.v) === semplice(r.aula))) aule.unshift({ v: r.aula, t: r.aula });
    const k = controlli(r);
    const campo = (nome, etichetta, html) => `<label class="campo-comp campo-${nome}"><span>${etichetta}</span>${html}</label>`;
    const sel = (nome, elenco, scelto, vuota) => `<select data-i="${i}" data-campo="${nome}">${opzioni(elenco, scelto, vuota)}</select>`;
    return `<li class="riga-comp${k.incompleta ? ' da-completare' : k.avvisi.length ? ' con-avvisi' : ''}">` +
      `<div class="campi-comp">` +
      campo('codice', 'Docente', sel('codice', docenti, r.codice, '— scegli —')) +
      campo('classe', 'Classe', sel('classe', classi, r.classe, '—')) +
      campo('giorno', 'Giorno', sel('giorno', giorni, r.giorno, '—')) +
      campo('ora', 'Ora', sel('ora', ore, r.ora, '—')) +
      campo('aula', 'Aula', sel('aula', aule, r.aula, 'del titolare')) +
      (g ? '' : campo('tipo', 'Tipo', `<input type="text" data-i="${i}" data-campo="tipo" value="${esc(r.tipo)}" placeholder="es. Sostegno">`)) +
      campo('note', 'Note', `<input type="text" data-i="${i}" data-campo="note" value="${esc(r.note)}">`) +
      `<button type="button" class="togli-comp" data-azione="togli" data-i="${i}" aria-label="Togli questa ora">✕</button>` +
      `</div>` +
      (k.info ? `<p class="info-comp">${esc(k.info)}</p>` : '') +
      k.avvisi.map(a => `<p class="avviso-comp">⚠ ${esc(a)}</p>`).join('') +
      `</li>`;
  }

  function schedaHtml(g, indice) {
    const mie = righe.map((r, i) => ({ r, i })).filter(x => g ? gruppoDi(x.r.tipo) === g : !gruppoDi(x.r.tipo));
    if (!g && !mie.length) return '';
    const complete = mie.filter(x => Compresenze.completa(x.r)).length;
    const titolo = g ? g.tipo : 'Altre compresenze';
    let conto = '';
    const prev = g ? previsteDi(g) : null;
    if (prev) {
      const ok = mie.length === prev && complete === prev;
      conto = `<span class="conto-comp${ok ? ' ok' : ''}">${complete} di ${prev}${mie.length > prev ? ` · ${mie.length - prev} in più` : ''}</span>`;
    } else conto = `<span class="conto-comp">${complete} ore</span>`;
    // quante ore ha già ciascun docente previsto
    const docenti = g && g.docenti && g.docenti.length ? `<ul class="docenti-comp">${g.docenti.map(x => {
      const n = mie.filter(y => y.r.codice === x.codice).length;
      return `<li class="${n === x.ore ? 'ok' : ''}">${esc(nomeDoc(x.codice))}: ${n} di ${x.ore}</li>`;
    }).join('')}</ul>` : '';
    const gid = g ? String(indice) : ALTRE;
    return `<section class="scheda-breve scheda-comp" aria-labelledby="titoloGruppo${gid}">` +
      `<div class="riga-breve"><h3 id="titoloGruppo${gid}" class="titolo-comp">${esc(titolo)}</h3>${conto}</div>` +
      (g && g.spiegazione ? `<p class="spiega-comp">${esc(g.spiegazione)}</p>` : '') + docenti +
      (mie.length ? `<ol class="righe-comp">${mie.map(x => rigaHtml(x.r, x.i, g)).join('')}</ol>` : '<p class="vuoto-breve">Nessuna ora inserita.</p>') +
      `<div class="azioni-scheda-comp"><button type="button" class="pulsante" data-azione="aggiungi" data-gruppo="${gid}">＋ Aggiungi un'ora</button>` +
      (g && g.nelleOreDi ? `<button type="button" class="pulsante leggero" data-azione="parallelo" data-gruppo="${gid}">Aggiungi le ore di ${esc(g.nelleOreDi)} che mancano</button>` : '') +
      `</div></section>`;
  }

  function disegna() {
    if (!box) return;
    const chiudi = '<button type="button" class="pulsante pulsante-tabella" data-azione="chiudi">Torna all\'orario</button>';
    let corpo = '';
    if (stato === 'carico') corpo = '<p class="data-breve">Leggo il Foglio Compresenze…</p>';
    else if (stato === 'errore') corpo = `<p class="data-breve">⚠️ ${esc(errore)}</p><div class="azioni-comp"><button type="button" class="pulsante" data-azione="ricarica">Riprova</button></div>`;
    else {
      const complete = righe.filter(Compresenze.completa).length;
      corpo = `<p class="data-breve">${complete} ore di compresenza · ${righe.length - complete} da completare</p>` +
        `<div class="azioni-comp"><button type="button" class="pulsante primario" data-azione="salva"${salvo || !modificato ? ' disabled' : ''}>Salva sul Foglio</button>` +
        `<button type="button" class="pulsante" data-azione="ricarica"${salvo || !modificato ? ' disabled' : ''}>Annulla le modifiche</button></div>` +
        (modificato ? '<p class="avviso-breve">Ci sono modifiche non salvate.</p>' : '');
    }
    const schede = stato === 'pronto'
      ? `<div class="schede-breve schede-comp">${gruppiHtml()}${gruppi().map((g, i) => schedaHtml(g, i)).join('')}${schedaHtml(null)}` +
        `<p class="nota-comp">Ogni ora è di un docente: le righe senza docente, giorno o ora restano «da completare» e l'app non le mostra. ` +
        `Nell'orario le compresenze si vedono spuntando «Compresenze».</p></div>`
      : '';
    // si ricorda dov'era il cursore, per rimetterlo lì dopo aver ridisegnato
    const a = document.activeElement, fuoco = a && box.contains(a) ? { i: a.dataset.i, g: a.dataset.g, campo: a.dataset.campo, azione: a.dataset.azione, gruppo: a.dataset.gruppo } : null;
    box.innerHTML = `<div class="testata-breve"><div class="riga-testata"><span class="marchio-breve">Gestione</span>${chiudi}</div>` +
      `<h2 id="titoloCompresenze">Compresenze</h2>${corpo}` +
      `<p class="messaggio-comp" role="status" aria-live="polite">${esc(messaggio)}</p></div>${schede}`;
    if (fuoco) {
      const sel = fuoco.campo ? (fuoco.g !== undefined ? `[data-g="${fuoco.g}"][data-campo="${fuoco.campo}"]` : `[data-i="${fuoco.i}"][data-campo="${fuoco.campo}"]`)
        : fuoco.azione ? `[data-azione="${fuoco.azione}"]${fuoco.gruppo ? `[data-gruppo="${fuoco.gruppo}"]` : fuoco.i ? `[data-i="${fuoco.i}"]` : ''}` : '';
      const el = sel && box.querySelector(sel);
      if (el) el.focus({ preventScroll: true });
    }
  }

  /* ---------- azioni ---------- */
  function gruppoDaId(id) { return id === ALTRE ? null : gruppi()[Number(id)]; }

  function aggiungi(id) {
    const g = gruppoDaId(id);
    // se il gruppo ha docenti previsti, la nuova ora va al primo a cui ne mancano
    let codice = '';
    if (g && g.docenti) {
      const manca = g.docenti.find(x => righe.filter(r => gruppoDi(r.tipo) === g && r.codice === x.codice).length < x.ore);
      if (manca) codice = manca.codice;
    }
    righe.push({ codice, classe: '', giorno: '', ora: '', tipo: g ? g.tipo : 'Sostegno', aula: '', note: '', nome: '' });
    modificato = true; messaggio = '';
    disegna();
    // il cursore va sulla prima tendina della nuova ora
    const nuova = box.querySelector(`[data-i="${righe.length - 1}"][data-campo="${codice ? 'classe' : 'codice'}"]`);
    if (nuova) nuova.focus();
  }

  // Gruppo «nelle ore di» una materia (es. Alternativa in parallelo a Religione): una riga per ogni ora di quella materia
  // che non ha ancora la sua riga; il docente si sceglie dopo
  function aggiungiParallelo(id) {
    const g = gruppoDaId(id); if (!g || !g.nelleOreDi) return;
    let n = 0;
    lezioniDi(g.nelleOreDi).forEach(l => {
      const cl = Dati.nome('classe', l.classe);
      const c = righe.some(r => gruppoDi(r.tipo) === g && semplice(r.classe) === semplice(cl) && r.giorno === l.giorno && Number(r.ora) === l.ora);
      if (!c) { righe.push({ codice: '', classe: cl, giorno: l.giorno, ora: l.ora, tipo: g.tipo, aula: '', note: '', nome: '' }); n++; }
    });
    if (n) modificato = true;
    messaggio = n ? `Aggiunte ${n} ore di ${g.nelleOreDi}: scegli il docente di ogni ora.` : `Tutte le ore di ${g.nelleOreDi} hanno già la loro riga.`;
    disegna();
  }

  /* ---------- riquadro «Gruppi e ore previste» (i dati di questa scuola, salvati nella scheda «Gruppi») ---------- */
  function gruppiHtml() {
    const riga = (g, i) => {
      const auto = g.nelleOreDi && (g.previste === '' || g.previste == null) ? ` (da sole: ${lezioniDi(g.nelleOreDi).length})` : '';
      const nomi = (g.docenti || []).map(x => nomeDoc(x.codice) + ' ' + x.ore).join(' · ');
      return `<li class="riga-comp"><div class="campi-comp campi-gruppo">` +
        `<label class="campo-comp campo-codice"><span>Gruppo (testo della colonna Tipo)</span><input type="text" data-g="${i}" data-campo="tipo" value="${esc(g.tipo)}"></label>` +
        `<label class="campo-comp"><span>Ore previste${esc(auto)}</span><input type="number" min="0" data-g="${i}" data-campo="previste" value="${esc(g.previste)}" placeholder="${g.nelleOreDi ? 'da sole' : '—'}"></label>` +
        `<label class="campo-comp"><span>Nelle ore di (materia)</span><input type="text" data-g="${i}" data-campo="nelleOreDi" value="${esc(g.nelleOreDi)}" placeholder="es. Religione"></label>` +
        `<label class="campo-comp campo-note"><span>Docenti previsti (codice:ore)</span><input type="text" data-g="${i}" data-campo="docenti" value="${esc(scriviDocenti(g.docenti))}" placeholder="es. DOC08:1, DOC19:2"></label>` +
        `<label class="campo-comp campo-note"><span>Spiegazione</span><input type="text" data-g="${i}" data-campo="spiegazione" value="${esc(g.spiegazione)}"></label>` +
        `<button type="button" class="togli-comp" data-azione="togli-gruppo" data-g="${i}" aria-label="Togli il gruppo ${esc(g.tipo)}">✕</button>` +
        `</div>${nomi ? `<p class="info-comp">${esc(nomi)}</p>` : ''}</li>`;
    };
    const aperto = gruppiAperti === null ? !gruppiDalFoglio : gruppiAperti;
    return `<details class="scheda-breve scheda-comp gruppi-comp"${aperto ? ' open' : ''}>` +
      `<summary class="titolo-comp">Gruppi e ore previste di questa scuola</summary>` +
      `<p class="spiega-comp">Cambiano da scuola a scuola (numero di classi, cattedre di potenziamento, ore eccedenti…): si salvano nella scheda «Gruppi» del Foglio. ` +
      `Con «Nelle ore di» (es. Religione) le ore previste si contano da sole nell'orario.</p>` +
      `<ol class="righe-comp">${gruppi().map(riga).join('')}</ol>` +
      `<div class="azioni-scheda-comp"><button type="button" class="pulsante" data-azione="aggiungi-gruppo">＋ Aggiungi un gruppo</button></div></details>`;
  }

  function cambioGruppo(el) {
    const g = gruppi()[Number(el.dataset.g)]; if (!g) return;
    const campo = el.dataset.campo, v = el.value.trim();
    if (campo === 'tipo') {
      if (!v) return;
      righe.forEach(r => { if (gruppoDi(r.tipo) === g) r.tipo = v; });   // le ore del gruppo seguono il nuovo nome
      g.tipo = v;
    } else if (campo === 'docenti') g.docenti = leggiDocenti(v);
    else if (campo === 'previste') g.previste = v === '' ? '' : String(Math.max(0, parseInt(v, 10) || 0));
    else g[campo] = v;
    modificato = true; messaggio = '';
    disegna();
  }

  function clic(e) {
    const b = e.target.closest('[data-azione]'); if (!b || b.disabled) return;
    const azione = b.dataset.azione;
    if (azione === 'chiudi') {
      if (modificato && !confirm('Ci sono modifiche non salvate. Tornare all\'orario lo stesso?')) return;
      ctx.chiudi();
    } else if (azione === 'salva') salva();
    else if (azione === 'ricarica') {
      if (modificato && !confirm('Annullare le modifiche non salvate e rileggere il Foglio?')) return;
      carica();
    } else if (azione === 'aggiungi') aggiungi(b.dataset.gruppo);
    else if (azione === 'parallelo') aggiungiParallelo(b.dataset.gruppo);
    else if (azione === 'aggiungi-gruppo') {
      gruppi().push({ tipo: 'Nuovo gruppo', previste: '', docenti: [], nelleOreDi: '', spiegazione: '', altriNomi: [] });
      gruppiAperti = true; modificato = true; messaggio = ''; disegna();
    } else if (azione === 'togli-gruppo') {
      const g = gruppi()[Number(b.dataset.g)]; if (!g) return;
      const n = righe.filter(r => gruppoDi(r.tipo) === g).length;
      if (n && !confirm('Il gruppo ha ' + n + ' ore: restano, ma passano in «Altre compresenze». Togliere il gruppo?')) return;
      gruppi().splice(Number(b.dataset.g), 1);
      modificato = true; messaggio = ''; disegna();
    }
    else if (azione === 'togli') {
      righe.splice(Number(b.dataset.i), 1);
      modificato = true; messaggio = 'Ora tolta (si toglie dal Foglio quando salvi).';
      disegna();
    }
  }

  function cambio(e) {
    const el = e.target;
    if (el.dataset.g !== undefined && el.dataset.campo) { cambioGruppo(el); return; }
    if (el.dataset.i === undefined || !el.dataset.campo) return;
    const r = righe[Number(el.dataset.i)]; if (!r) return;
    r[el.dataset.campo] = el.dataset.campo === 'ora' ? (parseInt(el.value, 10) || '') : el.value.trim();
    modificato = true; messaggio = '';
    disegna();
  }

  /*
    Apre la pagina. Va chiamata direttamente dal tocco sul tasto: così Google può chiedere il permesso di
    leggere e modificare il Foglio (altrimenti il browser bloccherebbe la finestra).
    ctx = { orario: () => D, email, chiudi(), applica() }
  */
  function apri(el, contesto) {
    ctx = contesto;
    if (box !== el) {
      box = el;
      box.addEventListener('click', clic);
      box.addEventListener('change', cambio);
      // il riquadro dei gruppi resta aperto o chiuso anche quando la pagina si ridisegna («toggle» non risale: si ascolta in cattura)
      box.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('gruppi-comp')) gruppiAperti = e.target.open; }, true);
    }
    permesso = NomiDocenti.gettone([NomiDocenti.PERMESSO_DRIVE, SCRIVERE], ctx.email);
    permesso.catch(() => {});   // l'errore lo mostra carica()
    carica();
  }

  // L'orario dell'app è cambiato (per esempio sono arrivati i nomi): si ridisegna senza perdere le modifiche
  // (non mentre si sta scrivendo in un campo: si perderebbe quello che non è ancora stato confermato)
  function aggiorna() {
    const a = document.activeElement;
    if (a && box && box.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName)) return;
    if (box && !box.hidden && stato === 'pronto') disegna();
  }

  // Ci sono modifiche non salvate (per chiedere conferma prima di chiudere la pagina in altri modi)
  const daSalvare = () => modificato;

  return { apri, aggiorna, daSalvare };
})();

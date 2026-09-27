/*
  uscite.js – modulo «Uscita didattica» della scheda Sostituzioni di Orario Facile.

  Il caso: alcune classi sono fuori (gita, visita, uscita sul territorio) con alcuni docenti accompagnatori.
  - Le lezioni delle classi fuori NON vanno coperte (la classe non c'è).
  - Le lezioni degli accompagnatori nelle classi che restano a scuola vanno coperte.
  - I docenti che in quelle ore avevano lezione con le classi fuori sono «liberati»: sono già a scuola e l'ora è già
    loro, quindi coprono gli assenti SENZA ore in più (niente +1 nel foglio del conteggio).

  Il piano proposto (piano()), ora per ora:
  1. per ogni ora da coprire si sceglie un docente liberato in quell'ora, prima chi ha lezione PRIMA E DOPO quell'ora
     (deve restare a scuola comunque); chi invece ha l'ora liberata all'inizio o alla fine della giornata si lascia
     libero, così può entrare dopo o uscire prima;
  2. se non c'è un docente liberato, si propone il primo docente libero delle proposte normali (+1 nel conteggio);
  3. le ore liberate che restano:
     - all'inizio o alla fine della giornata del docente → «entra dopo» / «esce prima», ore A RECUPERO
       (−1 per ogni ora nel foglio del conteggio, come un'assenza con «Recupero»);
     - in mezzo ad altre lezioni (non può né entrare dopo né uscire prima) → «a disposizione», NON a recupero;
     - almeno 1 ora il docente la fa sempre: se tutte le sue ore di quel giorno sono liberate, la prima resta
       «a disposizione».
  «Applica il piano» assegna le sostituzioni e registra le ore a recupero; tutto si può ancora cambiare a mano.

  Dati: chiave "sostituzioni.uscite" (archivio.js): [{ id, data, nome, classi: [id], ore: [n], accompagnatori: [id],
  disposizione: [{ docente, ore }] }]. La descrizione (nome) resta su questo dispositivo; si pubblicano solo
  data, classi, ore (app/js/pubblica-sostituzioni.js), così nell'app le classi fuori si vedono «🚌 In uscita».
  Gli accompagnatori diventano assenze (senza recupero) con uscita = ID e come = 'accompagna';
  le ore a recupero diventano assenze con recupero, uscita = ID e come = 'recupero'.
  Le regole e i dati dell'orario arrivano dal motore delle sostituzioni (Sostituzioni.motore()).
*/
const Uscite = (() => {
  let uscite = Archivio.leggi('uscite', []);
  const m = () => Sostituzioni.motore();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nuovoId = () => 'us' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const salva = () => { if (!Archivio.scrivi('uscite', uscite)) m().avvisa('Attenzione: non riesco a salvare le uscite didattiche su questo dispositivo.'); };
  const oreTesto = elenco => elenco.map(n => n + 'ª').join(', ');
  const numerico = (a, b) => String(a).localeCompare(String(b), 'it', { numeric: true });

  // Il modulo: le scelte restano anche quando la pagina si ridisegna
  const scelta = { data: '', nome: '', classi: new Set(), ore: null, accompagnatori: new Set() };
  // Nel piano: docente scelto a mano per un'ora (chiave "data|ora|classe|assente" -> ID docente)
  const forzate = new Map();
  let inCorso = false;

  // ---------- Regole ----------
  const usciteDel = iso => uscite.filter(u => u.data === iso);
  const classeFuori = (iso, classe, ora) => uscite.some(u => u.data === iso && u.classi.includes(classe) && u.ore.includes(ora));
  const accompagna = (iso, docente, ora) => uscite.some(u => u.data === iso && u.accompagnatori.includes(docente) && u.ore.includes(ora));
  const lezioniOra = (giorno, docente, ora) => m().orario().lezioni.filter(l => l.giorno === giorno && l.docente === docente && l.ora === ora);

  // Vero se il docente a quell'ora è «liberato»: aveva lezione solo con classi fuori, non accompagna e non è assente
  function liberato(iso, docente, ora) {
    const mo = m(); if (!mo.orario()) return false;
    const giorno = mo.giornoOrario(iso); if (!giorno || !usciteDel(iso).length) return false;
    const lez = lezioniOra(giorno, docente, ora);
    return lez.length > 0 && lez.every(l => classeFuori(iso, l.classe, ora)) &&
      !accompagna(iso, docente, ora) && !mo.assentiAllOra(iso, ora).has(docente);
  }

  /*
    Il piano del giorno: { coperture: [{ l, docente, tipo, alternative }], disposizione: [{ docente, ore, perche }],
    recuperi: [{ docente, prima: [ore], dopo: [ore], entra, esce }] } (null se quel giorno non ci sono uscite).
    tipo: 'liberato' (nessuna ora in più) | 'normale' (+1 nel conteggio) | '' (nessuno disponibile).
  */
  function piano(iso) {
    const mo = m(), D = mo.orario();
    if (!D || !usciteDel(iso).length) return null;
    const giorno = mo.giornoOrario(iso); if (!giorno) return null;
    const registro = mo.registroDel(iso);
    const daCoprire = mo.oreDaCoprire(iso).filter(l => !mo.sostituzioneDi(iso, l))
      .sort((a, b) => a.ora - b.ora || numerico(a.classe, b.classe));

    // Per ogni docente: F = ore liberate, R = ore in cui deve essere a scuola (lezioni con classi presenti + sostituzioni)
    const info = new Map();
    D.docente.forEach(t => {
      const lez = mo.lezioniDi(t.id, giorno);
      const F = new Set(), R = new Set();
      [...new Set(lez.map(l => l.ora))].forEach(h => {
        if (liberato(iso, t.id, h)) F.add(h);
        else if (!mo.assentiAllOra(iso, h).has(t.id) && !accompagna(iso, t.id, h) && lez.some(l => l.ora === h && !classeFuori(iso, l.classe, h))) R.add(h);
      });
      registro.filter(s => s.sostituto === t.id).forEach(s => { R.add(s.ora); F.delete(s.ora); });
      if (F.size) info.set(t.id, { F, R, usate: new Set() });
    });
    const liberi = (h, tranne) => [...info].filter(([id, x]) => x.F.has(h) && (!x.usate.has(h) || id === tranne)).map(([id]) => id);
    // Punteggio (più basso = da impiegare prima): 0 = ha lezione prima e dopo; 1 = non ha altre ore (almeno 1 la deve
    // fare); 2 + distanza = ora all'inizio o alla fine della sua giornata (meglio lasciarlo libero)
    function punteggio(id, h) {
      const R = [...info.get(id).R];
      if (!R.length) return 1;
      if (Math.min(...R) < h && h < Math.max(...R)) return 0;
      return 2 + Math.min(...R.map(r => Math.abs(r - h)));
    }
    const conosce = (id, classe) => D.lezioni.some(k => k.docente === id && k.classe === classe);
    const usatoNelPiano = new Set();   // "docente|ora" già scelti nel piano (anche docenti non liberati)

    const coperture = daCoprire.map(l => {
      const chiave = [iso, l.ora, l.classe, l.assente].join('|');
      let docente = '', tipo = '';
      const forzato = forzate.get(chiave);
      if (forzato === '__nessuno') { /* scelto «— nessuno —»: si lascia da coprire */ }
      else if (forzato && !usatoNelPiano.has(forzato + '|' + l.ora)) {
        docente = forzato;
        tipo = info.has(forzato) && info.get(forzato).F.has(l.ora) && !info.get(forzato).usate.has(l.ora) ? 'liberato' : 'normale';
      } else {
        const lib = liberi(l.ora).sort((a, b) => punteggio(a, l.ora) - punteggio(b, l.ora) ||
          conosce(b, l.classe) - conosce(a, l.classe) || mo.nomeDocente(a).localeCompare(mo.nomeDocente(b), 'it'));
        if (lib.length) { docente = lib[0]; tipo = 'liberato'; }
        else {
          const altro = mo.candidati(iso, l).find(c => !c.liberato && !usatoNelPiano.has(c.t.id + '|' + l.ora));
          if (altro) { docente = altro.t.id; tipo = 'normale'; }
        }
      }
      if (docente) {
        usatoNelPiano.add(docente + '|' + l.ora);
        if (tipo === 'liberato') { info.get(docente).usate.add(l.ora); info.get(docente).R.add(l.ora); }
      }
      return { l, chiave, docente, tipo };
    });
    // le alternative di ogni ora (per la tendina): i liberati di quell'ora e i primi docenti liberi
    coperture.forEach(c => {
      const lib = liberi(c.l.ora, c.docente).map(id => ({ id, liberato: true }));
      const altri = mo.candidati(iso, c.l).filter(k => !k.liberato && (!usatoNelPiano.has(k.t.id + '|' + c.l.ora) || k.t.id === c.docente))
        .slice(0, 5).map(k => ({ id: k.t.id, liberato: false }));
      c.alternative = lib.concat(altri.filter(a => !lib.some(x => x.id === a.id)));
      if (c.docente && !c.alternative.some(a => a.id === c.docente)) c.alternative.unshift({ id: c.docente, liberato: c.tipo === 'liberato' });
    });

    // Le ore liberate rimaste: a disposizione (in mezzo) o a recupero (all'inizio o alla fine)
    const disposizione = [], recuperi = [];
    info.forEach((x, id) => {
      const restanti = [...x.F].filter(h => !x.usate.has(h)).sort((a, b) => a - b);
      if (!restanti.length) return;
      const disp = [], prima = [], dopo = [];
      let perche = 'ha lezione prima e dopo';
      if (!x.R.size) { disp.push(restanti.shift()); x.R.add(disp[0]); perche = 'almeno 1 ora a scuola'; }
      const minR = Math.min(...x.R), maxR = Math.max(...x.R);
      restanti.forEach(h => { if (h < minR) prima.push(h); else if (h > maxR) dopo.push(h); else disp.push(h); });
      if (disp.length) disposizione.push({ docente: id, ore: disp.sort((a, b) => a - b), perche });
      if (prima.length || dopo.length) recuperi.push({ docente: id, prima, dopo, entra: minR, esce: maxR });
    });
    const perNome = (a, b) => mo.nomeDocente(a.docente).localeCompare(mo.nomeDocente(b.docente), 'it');
    return { coperture, disposizione: disposizione.sort(perNome), recuperi: recuperi.sort(perNome) };
  }

  // ---------- Azioni ----------
  function permesso() {
    if (m().stato().puoFare) return true;
    m().avvisa('Solo chi è nel foglio «Autorizzazioni» può registrare le uscite didattiche: prima verifica la tua autorizzazione.');
    return false;
  }
  // ore di un'assenza già registrata + quelle nuove, senza doppioni
  function unisciOre(iso, docente, nuove) {
    const gia = m().assenzeDel(iso).find(a => a.docente === docente);
    return [...new Set((gia ? gia.ore : []).concat(nuove))].sort((a, b) => a - b);
  }

  function registra(iso) {
    if (!permesso()) return;
    const mo = m(), giorno = mo.giornoOrario(iso);
    const classi = [...scelta.classi], ore = [...(scelta.ore || oreDelGiorno(giorno))].sort((a, b) => a - b);
    if (!classi.length) { mo.avvisa('Scegli almeno una classe che esce.'); return; }
    if (!ore.length) { mo.avvisa('Scegli almeno un\'ora dell\'uscita.'); return; }
    const u = { id: nuovoId(), data: iso, nome: scelta.nome.trim(), classi, ore, accompagnatori: [...scelta.accompagnatori], disposizione: [] };
    uscite.push(u); salva();
    // gli accompagnatori sono assenti nelle loro ore di lezione durante l'uscita (senza recupero: stanno lavorando)
    u.accompagnatori.forEach(id => {
      const sue = [...new Set(mo.lezioniDi(id, giorno).map(l => l.ora))].filter(h => ore.includes(h));
      if (sue.length) mo.registraAssenza(iso, id, unisciOre(iso, id, sue), false, [], { uscita: u.id, come: 'accompagna', silenzioso: true });
    });
    scelta.nome = ''; scelta.classi.clear(); scelta.ore = null; scelta.accompagnatori.clear();
    mo.avvisa(`🚌 Uscita registrata: ${classi.length} ${classi.length === 1 ? 'classe' : 'classi'}, ${u.accompagnatori.length} ` +
      `${u.accompagnatori.length === 1 ? 'accompagnatore' : 'accompagnatori'}. Il piano proposto è in «Ore da coprire».`);
    mo.ridisegna();
    const p = document.getElementById('sost-pianoUscita'); if (p) p.scrollIntoView({ behavior: 'smooth' });
  }

  async function applica(iso) {
    if (!permesso() || inCorso) return;
    const p = piano(iso); if (!p) return;
    const mo = m(), u = usciteDel(iso)[0];
    inCorso = true; mo.ridisegna();
    let sost = 0, rec = 0;
    try {
      // 1. le sostituzioni, una alla volta (il foglio del conteggio si aggiorna in fila)
      for (const c of p.coperture.filter(x => x.docente)) {
        await mo.assegna(iso, c.l, c.docente, { reindirizzato: c.tipo === 'liberato', uscita: u.id, silenzioso: true });
        sost++;
      }
      // 2. le ore a recupero di chi entra dopo o esce prima (−1 per ogni ora nel foglio del conteggio)
      p.recuperi.forEach(r => {
        const ore = r.prima.concat(r.dopo);
        mo.registraAssenza(iso, r.docente, unisciOre(iso, r.docente, ore), true, [], { uscita: u.id, come: 'recupero', silenzioso: true });
        rec += ore.length;
      });
      // 3. chi resta a disposizione (per la stampa e per l'app)
      u.disposizione = p.disposizione.map(d => ({ docente: d.docente, ore: d.ore }));
      salva();
      forzate.clear();
      mo.avvisa(`✔ Piano applicato: ${sost} ${sost === 1 ? 'sostituzione' : 'sostituzioni'}, ${rec} ${rec === 1 ? 'ora' : 'ore'} a recupero, ` +
        `${p.disposizione.length} ${p.disposizione.length === 1 ? 'docente' : 'docenti'} a disposizione.`);
    } finally { inCorso = false; mo.ridisegna(); }
  }

  async function togli(id) {
    if (!permesso()) return;
    const u = uscite.find(x => x.id === id); if (!u) return;
    if (!confirm('Togliere l\'uscita didattica? Vengono tolte anche le sostituzioni del piano, le assenze degli accompagnatori e le ore a recupero collegate.')) return;
    const mo = m(), iso = u.data;
    const assenzeU = mo.assenzeDel(iso).filter(a => a.uscita === u.id);
    const unica = usciteDel(iso).length === 1;
    const collegate = mo.registroDel(iso).filter(s => s.uscita === u.id || (unica && s.reindirizzato) || assenzeU.some(a => a.docente === s.assente));
    for (const s of collegate) await mo.annulla(s);
    for (const a of assenzeU) await mo.togliAssenza(a, true);
    uscite = uscite.filter(x => x.id !== u.id); salva();
    mo.avvisa('Uscita didattica tolta.');
    mo.ridisegna();
  }

  // ---------- Disegno ----------
  const oreDelGiorno = giorno => [...new Set(m().orario().lezioni.filter(l => l.giorno === giorno).map(l => l.ora))].sort((a, b) => a - b);
  const legati = new WeakSet();

  function disegnaModulo(box, iso) {
    const mo = m(), D = mo.orario();
    if (!D) return;
    if (!legati.has(box)) { legati.add(box); box.addEventListener('click', clic); box.addEventListener('change', cambio); box.addEventListener('input', cambio); }
    if (scelta.data !== iso) { scelta.data = iso; scelta.classi.clear(); scelta.ore = null; scelta.accompagnatori.clear(); }
    const giorno = mo.giornoOrario(iso);
    if (!giorno) { box.innerHTML = '<p class="hint">In questo giorno non c\'è lezione.</p>'; return; }
    const ore = oreDelGiorno(giorno), oreScelte = scelta.ore || new Set(ore);
    const classi = D.classe.slice().sort((a, b) => numerico(a.nome, b.nome));
    // prima i docenti che insegnano nelle classi scelte (sono i più probabili accompagnatori)
    const nelleClassi = new Set(D.lezioni.filter(l => scelta.classi.has(l.classe)).map(l => l.docente));
    const docenti = D.docente.slice().sort((a, b) => (nelleClassi.has(b.id) - nelleClassi.has(a.id)) || mo.nomeDocente(a.id).localeCompare(mo.nomeDocente(b.id), 'it'));
    const casella = (tipo, valore, testo, spuntata) =>
      `<label class="sost-casella"><input type="checkbox" data-us="${tipo}" value="${esc(valore)}"${spuntata ? ' checked' : ''}> ${esc(testo)}</label>`;
    const casellaDoc = t => {
      const oreQui = D.lezioni.filter(l => l.giorno === giorno && l.docente === t.id && oreScelte.has(l.ora));
      const inClassi = oreQui.filter(l => scelta.classi.has(l.classe)).length;
      return casella('acc', t.id, mo.nomeDocente(t.id) + (inClassi ? ` · ${inClassi} ${inClassi === 1 ? 'ora' : 'ore'} nelle classi che escono` :
        oreQui.length ? ` · ${oreQui.length} ${oreQui.length === 1 ? 'ora' : 'ore'} da coprire` : ' · nessuna lezione in quelle ore'), scelta.accompagnatori.has(t.id));
    };
    const giaQui = usciteDel(iso);
    box.innerHTML =
      (giaQui.length ? `<h4>Uscite di questo giorno</h4><ul class="sost-assenze">${giaQui.map(u => `<li><span><strong>🚌 ${esc(u.nome || 'Uscita didattica')}</strong> – ` +
        `${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))} · ${oreTesto(u.ore)} ora` +
        (u.accompagnatori.length ? ` · accompagnano: ${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}` : '') +
        `</span><button type="button" class="btn ghost sm" data-us="togli" data-id="${esc(u.id)}">Togli</button></li>`).join('')}</ul>` : '') +
      `<p class="hint">Scegli le classi che escono, le ore e i docenti che accompagnano: il programma propone chi copre gli
        accompagnatori (prima i docenti rimasti senza classe), chi può entrare dopo o uscire prima (a recupero) e chi resta a disposizione.</p>
      <label class="fl">Descrizione (facoltativa, resta su questo dispositivo)
        <input type="text" data-us="nome" value="${esc(scelta.nome)}" maxlength="80" placeholder="es. Museo, teatro, uscita sul territorio"></label>
      <fieldset class="sost-ore"><legend>Classi che escono</legend>${classi.map(c => casella('classe', c.id, c.nome, scelta.classi.has(c.id))).join('')}</fieldset>
      <fieldset class="sost-ore"><legend>Ore dell'uscita</legend>${ore.map(h => casella('ora', h, mo.testoOra(h), oreScelte.has(h))).join('')}</fieldset>
      <fieldset class="sost-ore"><legend>Docenti che accompagnano</legend>
        ${nelleClassi.size ? docenti.filter(t => nelleClassi.has(t.id)).map(casellaDoc).join('') : '<p class="hint">Scegli prima le classi: qui compaiono i loro docenti.</p>'}
        <details${docenti.some(t => !nelleClassi.has(t.id) && scelta.accompagnatori.has(t.id)) ? ' open' : ''}><summary>Altri docenti</summary>
          ${docenti.filter(t => !nelleClassi.has(t.id)).map(casellaDoc).join('')}</details>
      </fieldset>
      <button type="button" class="btn" data-us="registra">🚌 Registra l'uscita e proponi il piano</button>`;
  }

  function disegnaPiano(box, iso) {
    if (!box) return;
    if (!legati.has(box)) { legati.add(box); box.addEventListener('click', clic); box.addEventListener('change', cambio); }
    const p = piano(iso);
    if (!p) { box.innerHTML = ''; return; }
    const mo = m(), qui = usciteDel(iso);
    const nome = id => esc(mo.nomeDocente(id));
    // chi è già stato messo a recupero dall'uscita (piano già applicato)
    const giaRecupero = mo.assenzeDel(iso).filter(a => a.come === 'recupero');
    const inAttesa = p.coperture.some(c => c.docente) || p.recuperi.length;
    const riga = c => {
      const nota = c.tipo === 'liberato' ? '🚌 liberato dall\'uscita: nessuna ora in più'
        : c.tipo === 'normale' ? '+1 nel conteggio (nessun docente liberato libero in quest\'ora)' : '⚠ nessun docente disponibile: vedi sotto';
      return `<tr><th scope="row">${esc(mo.testoOra(c.l.ora))}</th><td>${esc(mo.nome('classe', c.l.classe))}</td><td>${nome(c.l.assente)}</td>
        <td><label class="sost-solo-lettori" for="us-${esc(c.chiave)}">Chi copre</label>
        <select id="us-${esc(c.chiave)}" data-us="scegli" data-chiave="${esc(c.chiave)}"><option value="">— nessuno —</option>${c.alternative.map(a =>
          `<option value="${esc(a.id)}"${a.id === c.docente ? ' selected' : ''}>${a.liberato ? '🚌 ' : ''}${nome(a.id)}</option>`).join('')}</select></td>
        <td class="${c.tipo === 'liberato' ? '' : 'sost-attenzione'}">${nota}</td></tr>`;
    };
    const oraDi = h => h + 'ª';
    box.innerHTML = `<article class="sost-ora sost-piano-uscita">
      <h3>🚌 Uscita didattica: piano proposto</h3>
      <p class="sost-dettagli">${qui.map(u => `${esc(u.nome || 'Uscita')}: ${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))} fuori (${oreTesto(u.ore)} ora)` +
        (u.accompagnatori.length ? ` · accompagnano ${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}` : '')).join(' · ')}</p>
      ${p.coperture.length ? `<div class="tablewrap"><table class="sost-tabella"><caption>Ore da coprire e proposta</caption>
        <thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Assente</th><th scope="col">Copre</th><th scope="col">Note</th></tr></thead>
        <tbody>${p.coperture.map(riga).join('')}</tbody></table></div>` : '<p class="hint">✔ Nessuna ora ancora da coprire.</p>'}
      ${p.recuperi.length ? `<h4>Entrano dopo o escono prima (ore a recupero: −1 per ogni ora nel conteggio)</h4><ul>${p.recuperi.map(r =>
        `<li><strong>${nome(r.docente)}</strong>: ${[r.prima.length ? `entra alla ${oraDi(r.entra)} ora (${oreTesto(r.prima)} a recupero)` : '',
          r.dopo.length ? `esce dopo la ${oraDi(r.esce)} ora (${oreTesto(r.dopo)} a recupero)` : ''].filter(Boolean).join(' e ')}</li>`).join('')}</ul>` : ''}
      ${giaRecupero.length ? `<h4>Già registrati a recupero</h4><ul>${giaRecupero.map(a => `<li><strong>${nome(a.docente)}</strong>: ${oreTesto(a.ore)} ora</li>`).join('')}</ul>` : ''}
      ${p.disposizione.length ? `<h4>A disposizione (restano a scuola, nessun recupero)</h4><ul>${p.disposizione.map(d =>
        `<li><strong>${nome(d.docente)}</strong>: ${oreTesto(d.ore)} ora · ${esc(d.perche)}</li>`).join('')}</ul>` : ''}
      <div class="row">${inAttesa ? `<button type="button" class="btn" data-us="applica" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>${inCorso ? 'Applico…' : '✔ Applica il piano'}</button>`
        : '<span class="tag ok">✔ Piano applicato</span>'}
        ${p.coperture.length ? '<span class="hint">Si può cambiare chi copre con la tendina (🚌 = liberato dall\'uscita) o assegnare le ore una per una qui sotto.</span>' : ''}</div>
    </article>`;
  }

  // Tabella per la stampa del giorno (vuota se non ci sono uscite)
  function tabellaStampa(iso) {
    const p = piano(iso); if (!p) return '';
    const mo = m(), nome = id => esc(mo.nomeDocente(id));
    const giaRecupero = mo.assenzeDel(iso).filter(a => a.come === 'recupero');
    const righe = usciteDel(iso).map(u => `<tr><th scope="row">${esc(u.nome || 'Uscita didattica')}</th><td>${esc(u.classi.map(c => mo.nome('classe', c)).join(', '))}</td>
      <td>${oreTesto(u.ore)}</td><td>${esc(u.accompagnatori.map(mo.nomeDocente).join(', '))}</td></tr>`).join('');
    const disp = p.disposizione.map(d => `${nome(d.docente)} (${oreTesto(d.ore)})`).join(', ');
    const rec = giaRecupero.map(a => `${nome(a.docente)} (${oreTesto(a.ore)})`).join(', ');
    return `<table class="sost-tabella"><caption>Uscite didattiche</caption>
      <thead><tr><th scope="col">Uscita</th><th scope="col">Classi fuori</th><th scope="col">Ore</th><th scope="col">Accompagnatori</th></tr></thead>
      <tbody>${righe}${disp ? `<tr><th scope="row">A disposizione</th><td colspan="3">${disp}</td></tr>` : ''}${rec ? `<tr><th scope="row">Entrano dopo / escono prima</th><td colspan="3">${rec}</td></tr>` : ''}</tbody></table>`;
  }

  // ---------- Eventi ----------
  function clic(e) {
    const b = e.target.closest('button[data-us]'); if (!b || b.disabled) return;
    const a = b.dataset.us;
    if (a === 'registra') registra(scelta.data);
    else if (a === 'togli') togli(b.dataset.id);
    else if (a === 'applica') applica(b.dataset.data);
  }
  function cambio(e) {
    const c = e.target.closest('[data-us]'); if (!c) return;
    const a = c.dataset.us;
    if (a === 'nome') { scelta.nome = c.value; return; }   // solo testo: niente ridisegno (si perderebbe il cursore)
    if (e.type === 'input') return;
    if (a === 'classe') { c.checked ? scelta.classi.add(c.value) : scelta.classi.delete(c.value); }
    else if (a === 'ora') {
      const giorno = m().giornoOrario(scelta.data);
      if (!scelta.ore) scelta.ore = new Set(oreDelGiorno(giorno));
      c.checked ? scelta.ore.add(Number(c.value)) : scelta.ore.delete(Number(c.value));
    } else if (a === 'acc') { c.checked ? scelta.accompagnatori.add(c.value) : scelta.accompagnatori.delete(c.value); }
    else if (a === 'scegli') { c.value ? forzate.set(c.dataset.chiave, c.value) : forzate.set(c.dataset.chiave, '__nessuno'); }
    // dopo il ridisegno il cursore torna sulla stessa casella (per chi usa la tastiera)
    const selettore = `[data-us="${a}"]` + (a === 'scegli' ? `[data-chiave="${CSS.escape(c.dataset.chiave)}"]` : `[value="${CSS.escape(c.value)}"]`);
    m().ridisegna();
    const di = document.querySelector(selettore); if (di) di.focus();
  }

  // Se le uscite cambiano in un'altra scheda del browser, le rileggiamo (il motore poi ridisegna)
  window.addEventListener('storage', e => { if (e.key === 'sostituzioni.uscite') uscite = Archivio.leggi('uscite', []); });

  return { usciteDel, classeFuori, accompagna, liberato, piano, disegnaModulo, disegnaPiano, tabellaStampa };
})();

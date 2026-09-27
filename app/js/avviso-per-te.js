/*
  avviso-per-te.js – il riquadro che scende dall'alto con le sostituzioni che riguardano il docente che ha fatto l'accesso.

  - «Sostituisci»: le lezioni (da oggi in poi) in cui il docente copre un collega assente;
  - «Sei sostituito»: le sue lezioni coperte da un collega (o ancora da coprire);
  - «Cambio d'aula»: le sue lezioni (anche quelle in cui sostituisce) spostate in un'altra aula.
  I dati sono quelli delle sostituzioni della settimana (Supplenze.settimana, cioè le sostituzioni pubblicate
  con «Pubblica sostituzioni» o registrate su questo dispositivo).
  Il riquadro compare quando si apre l'app o quando arriva una sostituzione nuova (l'app ricontrolla ogni pochi minuti);
  con «Ho visto» non ricompare per le stesse lezioni. Se l'utente ha dato il permesso alle notifiche e l'app è in
  secondo piano, arriva anche la notifica del telefono.
  In memoria (localStorage) restano solo le "chiavi" delle lezioni già viste: data, ora e classe, niente nomi.
*/
const AvvisoPerTe = (() => {
  const CHIAVE_VISTI = 'orariodada.avvisiVisti';
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const leggiVisti = () => { try { return JSON.parse(localStorage.getItem(CHIAVE_VISTI) || '[]') || []; } catch (e) { return []; } };
  const salvaVisti = v => { try { localStorage.setItem(CHIAVE_VISTI, JSON.stringify(v.slice(-300))); } catch (e) { /* ignorato */ } };
  const oggiIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dataBreve = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  let mostrati = '';        // le chiavi nel riquadro aperto adesso (per non ridisegnarlo a ogni minuto)
  let allApertura = null;   // funzione dell'app: apre «Il mio orario»

  // Le sostituzioni della settimana che riguardano il docente "mio" (da oggi in poi)
  function elenco(D, sost, mio) {
    if (!D || !sost || !mio) return [];
    const oggi = oggiIso(), out = [];
    const nome = (tipo, id) => (typeof Dati !== 'undefined' ? Dati.nome(tipo, id) : id);
    const ora = n => { const o = (D.ore || []).find(x => x.n === n); return n + 'ª ora' + (o ? ` (${o.inizio}–${o.fine})` : ''); };
    const quando = l => { const iso = sost.date.get(l.giorno) || ''; return { iso, testo: `${l.giorno} ${iso ? dataBreve(iso) : ''}, ${ora(l.ora)}` }; };
    // 1. lezioni in cui sostituisco un collega
    sost.extra.filter(l => l.docente === mio.id).forEach(l => {
      const q = quando(l); if (!q.iso || q.iso < oggi) return;
      out.push({ chiave: ['S', q.iso, l.ora, l.classe].join('|'), iso: q.iso, ora: l.ora, tipo: 'sostituisci',
        testo: `<b>Sostituisci</b> in <b>${esc(nome('classe', l.classe))}</b> · ${esc(q.testo)}` +
          (l.aula ? ` · aula <b>${esc(nome('aula', l.aula))}</b>` : '') + (l.materia ? ` · ${esc(l.materia)}` : '') +
          ` <span class="per-te-mini">(al posto di ${esc(nome('docente', l.assente))})</span>` });
    });
    // 2. le mie lezioni coperte da un collega (o ancora da coprire)
    D.lezioni.filter(l => l.docente === mio.id).forEach(l => {
      const s = sost.segnate.get([l.giorno, l.ora, l.classe, l.docente].join('|')); if (!s) return;
      const q = quando(l); if (!q.iso || q.iso < oggi) return;
      out.push({ chiave: ['A', q.iso, l.ora, l.classe, s.sostituto || '-'].join('|'), iso: q.iso, ora: l.ora, tipo: 'sostituito',
        testo: `La tua lezione in <b>${esc(nome('classe', l.classe))}</b> · ${esc(q.testo)} ` +
          // classe fuori per un'uscita didattica (sostituzioni/js/uscite.js): la lezione non si fa
          (s.uscita ? '<b>non si fa: la classe è in uscita didattica</b>' :
            s.sostituto ? `è coperta da <b>${esc(nome('docente', s.sostituto))}</b>` : '<b>è ancora da coprire</b>') });
    });
    // 3. cambi d'aula nelle mie lezioni (anche quelle in cui sostituisco un collega)
    if (sost.cambi) D.lezioni.concat(sost.extra).forEach(l => {
      if (l.docente !== mio.id) return;
      const c = sost.cambi.get([l.giorno, l.ora, l.classe].join('|')); if (!c) return;
      // una mia lezione sostituita da un altro: il cambio d'aula riguarda chi mi sostituisce
      const s = !l.sostituzione && sost.segnate.get([l.giorno, l.ora, l.classe, l.docente].join('|')); if (s && s.sostituto) return;
      const q = quando(l); if (!q.iso || q.iso < oggi) return;
      out.push({ chiave: ['C', q.iso, l.ora, l.classe, c.a].join('|'), iso: q.iso, ora: l.ora, tipo: 'aula',
        testo: `<b>Cambio d'aula</b> per <b>${esc(nome('classe', l.classe))}</b> · ${esc(q.testo)} · ` +
          (c.da ? `da ${esc(nome('aula', c.da))} ` : '') + `a <b>${esc(nome('aula', c.a))}</b>` });
    });
    return out.sort((a, b) => a.iso.localeCompare(b.iso) || a.ora - b.ora);
  }

  function chiudi(segnaVisti) {
    const box = $('#avvisoPerTe'); if (!box || box.hidden) return;
    if (segnaVisti) salvaVisti([...new Set(leggiVisti().concat(mostrati.split('\n').filter(Boolean)))]);
    box.classList.remove('aperto');
    setTimeout(() => { box.hidden = true; }, 300);
    mostrati = '';
  }

  function notifica(nuovi) {
    if (!document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
    const primo = nuovi[0].testo.replace(/<[^>]+>/g, '');
    const opzioni = { body: nuovi.length > 1 ? `${primo} (e altre ${nuovi.length - 1})` : primo, tag: 'sostituzioni-per-te', icon: 'icone/icona-192.png' };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification('Sostituzioni per te', opzioni)).catch(() => {});
    else { try { new Notification('Sostituzioni per te', opzioni); } catch (e) { /* non supportato */ } }
  }

  /*
    Da chiamare a ogni aggiornamento della pagina: mostra il riquadro se ci sono sostituzioni non ancora viste.
    opz: { D, sost, mio, spento (monitor/ingresso: niente riquadro), apriMioOrario }
  */
  function aggiorna(opz) {
    const box = $('#avvisoPerTe'); if (!box) return;
    allApertura = opz.apriMioOrario || null;
    if (opz.spento) { chiudi(false); return; }
    const visti = new Set(leggiVisti());
    const tutti = elenco(opz.D, opz.sost, opz.mio);
    const nuovi = tutti.filter(x => !visti.has(x.chiave));
    const chiavi = nuovi.map(x => x.chiave).join('\n');
    if (!nuovi.length) { chiudi(false); return; }
    if (chiavi === mostrati) return;           // già aperto con le stesse righe
    const nuoveDavvero = nuovi.filter(x => !mostrati.includes(x.chiave));
    mostrati = chiavi;
    const sostituisci = nuovi.filter(x => x.tipo === 'sostituisci').length, aule = nuovi.filter(x => x.tipo === 'aula').length;
    $('#titoloPerTe').textContent = sostituisci
      ? `🔄 ${sostituisci === 1 ? 'Hai una sostituzione' : `Hai ${sostituisci} sostituzioni`}`
      : aule === nuovi.length ? `⇄ ${aule === 1 ? 'Cambio d\'aula' : 'Cambi d\'aula'} nelle tue lezioni` : '🔄 Novità sulle tue lezioni';
    $('#elencoPerTe').innerHTML = nuovi.map(x => `<li class="per-te-${x.tipo}">${x.testo}</li>`).join('');
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('aperto'));
    if (nuoveDavvero.length) notifica(nuoveDavvero);
  }

  // Tasti del riquadro
  document.addEventListener('click', e => {
    if (e.target.closest('#chiudiPerTe')) chiudi(true);
    else if (e.target.closest('#vediPerTe')) { chiudi(true); if (allApertura) allApertura(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(false); });

  return { aggiorna, elenco };
})();

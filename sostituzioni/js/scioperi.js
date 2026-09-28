/*
  scioperi.js – modulo «Sciopero / assemblea sindacale» della scheda Sostituzioni di Orario Facile.

  1. Si sceglie il giorno, il tipo (sciopero = tutta la giornata; assemblea = le ore indicate) e si carica il file
     delle adesioni (.xlsx / .ods / .csv, colonne Docente, data_presa_visione, adesione). Il file si legge SOLO nel
     browser: i nomi restano in memoria, si tengono solo i codici dei docenti (DOC01…).
     - POTENZIALI SCIOPERANTI: hanno la data di presa visione e come adesione «Adesione confermata»,
       «Non ha ancora maturato una decisione» oppure niente;
     - non contano: chi non ha la presa visione (non informato) e chi ha «Adesione negata».
  2. Il piano (calcola()), classe per classe e ora per ora, guardando anche le compresenze (sostegno, potenziamento,
     alternativa: Compresenze.lezioni): una classe è SCOPERTA in un'ora se tutti i suoi docenti di quell'ora sono
     potenziali scioperanti (o assenti).
     - ore scoperte all'inizio → ENTRATA POSTICIPATA (all'orario della campanella: 3ª ora = fine intervallo, 10:05);
     - ore scoperte alla fine → USCITA ANTICIPATA;
     - ore scoperte in mezzo → VIGILANZA (non si fa lezione), scegliendo in quest'ordine:
       a. il docente CURRICOLARE di una classe con compresenza (il compresente resta con la sua classe);
       b. se serve, si ACCORCIA l'orario di tutta la scuola di 1, 2 o 3 ore: chi perde le ultime ore copre le ore
          scoperte della giornata in cui è libero (tante quante le ore perse), gli altri restano a disposizione.
       MAI ore in più (docenti liberi o «a debito»): durante uno sciopero si usano solo le ore di chi è già in servizio.
  3. Tutto si può cambiare (potenziali, riduzione, chi vigila); poi «✔ Conferma il piano» registra le vigilanze
     (sostituzioni con sciopero = ID, nessun +1 nel conteggio), «📄 Scarica la comunicazione» prepara il
     documento per le famiglie, «🖨️ Stampa» stampa il piano.

  PRIVACY: l'adesione a uno sciopero è un dato sindacale (GDPR art. 9). Nel file pubblicato e nell'app NON si dice
  mai chi sciopera: solo, per ogni classe, entrata posticipata / uscita anticipata / vigilanza (con chi vigila).
  Dati sul dispositivo: chiave "sostituzioni.scioperi" (archivio.js), solo codici.
*/
const Scioperi = (() => {
  let eventi = Archivio.leggi('scioperi', []);   // [{ id, data, tipo, ore, potenziali, esclusi, riduzione, forzate, confermato, esito, conteggi }]
  const m = () => Sostituzioni.motore();
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nuovoId = () => 'sc' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const salva = () => { if (!Archivio.scrivi('scioperi', eventi)) m().avvisa('Attenzione: non riesco a salvare lo sciopero su questo dispositivo.'); };
  const semplice = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const numerico = (a, b) => String(a).localeCompare(String(b), 'it', { numeric: true });
  const MAX_RIDUZIONE = 3;   // di quante ore si può accorciare al massimo la giornata di tutta la scuola
  const TIPI = { sciopero: 'Sciopero', assemblea: 'Assemblea sindacale' };
  const dataLunga = iso => new Date(iso + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const eventoDel = iso => eventi.find(e => e.data === iso) || null;
  let inCorso = false;

  // ---------- Orari della campanella (dati/campanella.json): a che ora si entra e si esce ----------
  let suoni = null;
  function caricaCampanella() {
    if (suoni) return;
    suoni = [];
    fetch('../dati/campanella.json', { cache: 'no-cache' }).then(r => r.json()).then(j => { suoni = (j && j.suoni) || []; m().ridisegna(); }).catch(() => {});
  }
  // inizio della n-esima ora: il suono «inizio nª ora» (per la 3ª: «Fine intervallo · inizio 3ª ora» = 10:05)
  function inizioOra(n) {
    const s = suoni && suoni.find(x => new RegExp('inizio\\s+' + n + '\\s*ª?\\s*ora', 'i').test(x.nome));
    if (s) return s.ora;
    const o = (m().orario().ore || []).find(x => x.n === n); return (o && o.inizio) || '';
  }
  // fine della n-esima ora: il suono che viene subito dopo il suo inizio (inizio intervallo o inizio ora dopo)
  function fineOra(n) {
    const i = suoni ? suoni.findIndex(x => new RegExp('inizio\\s+' + n + '\\s*ª?\\s*ora', 'i').test(x.nome)) : -1;
    if (i >= 0 && suoni[i + 1]) return suoni[i + 1].ora;
    const o = (m().orario().ore || []).find(x => x.n === n); return (o && o.fine) || '';
  }

  // ---------- Il file delle adesioni ----------
  /*
    Legge il file e restituisce { potenziali: [id docente], nonInformati, negati, nonTrovati: [nomi] }.
    I nomi del file restano solo qui, in memoria: si confrontano con i nomi veri dei docenti (Sostituzioni.nomeVero).
  */
  async function leggiAdesioni(file) {
    const mo = m();
    const fogli = await Foglio.leggiTabelle(file);
    // il foglio con l'intestazione giusta: una riga con «docente» e «adesione»
    let righe = null, testa = -1;
    for (const f of fogli) {
      const i = f.righe.findIndex(r => r.some(c => /docente/i.test(c)) && r.some(c => /adesione/i.test(c)));
      if (i >= 0) { righe = f.righe; testa = i; break; }
    }
    if (!righe) throw new Error('nel file non trovo le colonne «Docente» e «adesione»');
    const t = righe[testa].map(c => semplice(c));
    const cDoc = t.findIndex(x => x.includes('docente')), cPresa = t.findIndex(x => x.includes('presa')),
      cAdes = t.findIndex(x => x === 'adesione' || (x.includes('adesione') && !x.includes('data')));
    if (cPresa < 0 || cAdes < 0) throw new Error('nel file mancano le colonne «data_presa_visione» o «adesione»');
    // i docenti dell'orario per nome vero (le parole in qualsiasi ordine: «Rossi Anna» = «Anna Rossi»)
    await mo.preparaNomiVeri();
    const chiave = n => semplice(n).split(' ').filter(Boolean).sort().join(' ');
    const perNome = new Map();
    mo.orario().docente.forEach(d => { perNome.set(chiave(mo.nomeVero(d.id)), d.id); });
    const esito = { potenziali: [], nonInformati: 0, negati: 0, nonTrovati: [] };
    righe.slice(testa + 1).forEach(r => {
      const nome = String(r[cDoc] == null ? '' : r[cDoc]).trim(); if (!nome) return;
      const presa = String(r[cPresa] == null ? '' : r[cPresa]).trim() !== '';
      const ades = semplice(r[cAdes]);
      if (!presa) { esito.nonInformati++; return; }        // non informato: non conta
      if (ades.includes('negat')) { esito.negati++; return; }  // «Adesione negata»: sicuramente non sciopera
      // confermata, «non ha ancora maturato una decisione» o vuota: potenziale scioperante
      let id = perNome.get(chiave(nome));
      if (!id) {
        // se nel file c'è anche un secondo nome: basta che tutte le parole del nome dell'orario ci siano
        const parole = new Set(chiave(nome).split(' '));
        const trovati = [...perNome].filter(([k]) => k && k.split(' ').every(p => parole.has(p)));
        if (trovati.length === 1) id = trovati[0][1];
      }
      if (id) { if (!esito.potenziali.includes(id)) esito.potenziali.push(id); } else esito.nonTrovati.push(nome);
    });
    return esito;
  }

  // ---------- Il piano ----------
  /*
    Calcola il piano di un evento. Restituisce { k (ore tolte alla giornata), limite (ultima ora che si fa),
    classi: Map id -> { nonEntra, entra, esce, fuori: Set(ore), scoperte: [ore] }, coperture: [{ classe, ora, docente,
    tipo, da, alternative }], nonCoperte, disposizione: [{ docente, ore }] }.
    tipo: 'spostato' (curricolare da una classe in compresenza) | 'recuperato' | '' (nessuno).
  */
  function calcola(ev) {
    const mo = m(), D = mo.orario(); if (!D) return null;
    const giorno = mo.giornoOrario(ev.data); if (!giorno) return null;
    const curr = (D.lezioniCurricolari || D.lezioni).filter(l => l.giorno === giorno && !l.compresenza);
    if (!curr.length) return null;
    const comp = (typeof Compresenze !== 'undefined' ? Compresenze.lezioni(D) : []).filter(l => l.giorno === giorno);
    const tutte = curr.concat(comp);
    const scioperanti = new Set(ev.potenziali.filter(id => !(ev.esclusi || []).includes(id)));
    const assente = (t, h) => (scioperanti.has(t) && ev.ore.includes(h)) || mo.assentiAllOra(ev.data, h).has(t);
    const maxOra = Math.max(...curr.map(l => l.ora));
    const altri = mo.registroDel(ev.data).filter(s => s.sciopero !== ev.id);   // sostituzioni già assegnate per altri motivi

    function prova(k) {
      const limite = maxOra - k;
      const classi = new Map();
      D.classe.forEach(c => {
        const oreC = [...new Set(curr.filter(l => l.classe === c.id).map(l => l.ora))].sort((a, b) => a - b);
        if (!oreC.length) return;
        const presenti = h => tutte.filter(l => l.classe === c.id && l.ora === h && !assente(l.docente, h));
        const coperte = oreC.filter(h => h <= limite && presenti(h).length);
        const i = { id: c.id, ore: oreC, nonEntra: !coperte.length, entra: null, esce: null, fuori: new Set(), scoperte: [] };
        if (!i.nonEntra) {
          i.entra = coperte[0]; i.esce = coperte[coperte.length - 1];
          i.scoperte = oreC.filter(h => h > i.entra && h < i.esce && !presenti(h).length);
        }
        oreC.forEach(h => { if (i.nonEntra || h < i.entra || h > i.esce) i.fuori.add(h); });
        classi.set(c.id, i);
      });
      const presente = (cid, h) => { const i = classi.get(cid); return !!i && !i.fuori.has(h); };
      // occupato = ha lezione in quell'ora con una classe che c'è
      const occupato = (t, h) => tutte.some(l => l.docente === t && l.ora === h && presente(l.classe, h));
      const usati = new Set();                        // "ora|docente" già impegnati nel piano
      const presiDa = new Map();                      // "ora|classe" -> quanti docenti ne sono stati spostati
      const giaUsato = (t, h) => usati.has(h + '|' + t) || altri.some(s => s.ora === h && s.sostituto === t);
      // recuperati: chi perde le ultime ore (giornata accorciata) e non sciopera; può coprire tante ore quante ne perde
      const tagliate = new Map();
      if (k > 0) tutte.filter(l => l.ora > limite && !assente(l.docente, l.ora)).forEach(l => {
        if (!tagliate.has(l.docente)) tagliate.set(l.docente, new Set());
        tagliate.get(l.docente).add(l.ora);
      });
      const credito = new Map([...tagliate].map(([t, s]) => [t, s.size]));

      function candidati(cid, h) {
        const out = [], visti = new Set();
        const aggiungi = (id, tipo, da) => { if (visti.has(id) || giaUsato(id, h) || assente(id, h)) return; visti.add(id); out.push({ id, tipo, da }); };
        // a. docente curricolare di un'altra classe che in quell'ora ha anche un compresente (che resta con la classe)
        classi.forEach((i2, c2) => {
          if (c2 === cid || !presente(c2, h)) return;
          const pres = tutte.filter(l => l.classe === c2 && l.ora === h && !assente(l.docente, h) && !usati.has(h + '|' + l.docente));
          if (pres.length - (presiDa.get(h + '|' + c2) || 0) < 2) return;
          pres.filter(l => !l.compresenza).forEach(l => aggiungi(l.docente, 'spostato', c2));
        });
        // b. recuperati dalla giornata accorciata (chi è presente ha la sua classe in aula: non è mai «libero»)
        tagliate.forEach((s, t) => { if ((credito.get(t) || 0) > 0 && !occupato(t, h)) aggiungi(t, 'recuperato'); });
        // NIENTE docenti liberi né «a debito»: durante uno sciopero non si coprono gli scioperanti con ore in più,
        // si usano solo le ore di chi è già in servizio (se non bastano, si riduce l'orario di tutta la scuola)
        return out;
      }

      const daCoprire = [];
      classi.forEach(i => i.scoperte.forEach(h => daCoprire.push({ cid: i.id, h })));
      daCoprire.sort((a, b) => a.h - b.h || numerico(a.cid, b.cid));
      const coperture = daCoprire.map(({ cid, h }) => {
        const chiave = h + '|' + cid, forzato = (ev.forzate || {})[chiave];
        const alternative = candidati(cid, h);
        let scelto = null;
        if (forzato === '__nessuno') scelto = null;
        else if (forzato && alternative.some(a => a.id === forzato)) scelto = alternative.find(a => a.id === forzato);
        else scelto = alternative[0] || null;
        if (scelto) {
          usati.add(h + '|' + scelto.id);
          if (scelto.tipo === 'spostato') presiDa.set(h + '|' + scelto.da, (presiDa.get(h + '|' + scelto.da) || 0) + 1);
          if (scelto.tipo === 'recuperato') credito.set(scelto.id, credito.get(scelto.id) - 1);
        }
        return { classe: cid, ora: h, chiave, docente: scelto ? scelto.id : '', tipo: scelto ? scelto.tipo : '', da: scelto ? scelto.da : '', alternative };
      });
      const disposizione = [...tagliate].filter(([t]) => (credito.get(t) || 0) > 0 && !coperture.some(c => c.docente === t))
        .map(([t, s]) => ({ docente: t, ore: [...s].sort((a, b) => a - b) }));
      // Da controllare il giorno stesso: classi in cui un potenziale scioperante è in compresenza con qualcuno che resta
      // (la classe è coperta solo da chi rimane). Solo per il piano interno: MAI nella comunicazione alle famiglie.
      const soloCompresente = [];
      classi.forEach(i => i.ore.forEach(h => {
        if (i.fuori.has(h) || i.scoperte.includes(h)) return;
        const qui = tutte.filter(l => l.classe === i.id && l.ora === h);
        const via = qui.filter(l => assente(l.docente, h)).map(l => l.docente);
        if (!via.length) return;
        // chi resta: i presenti, tranne chi è stato spostato a vigilare in un'altra classe
        const spostati = new Set(coperture.filter(c => c.ora === h && c.tipo === 'spostato' && c.da === i.id).map(c => c.docente));
        const restano = qui.filter(l => !assente(l.docente, h) && !spostati.has(l.docente)).map(l => l.docente);
        soloCompresente.push({ classe: i.id, ora: h, assenti: [...new Set(via)], restano: [...new Set(restano)] });
      }));
      soloCompresente.sort((a, b) => a.ora - b.ora || numerico(a.classe, b.classe));
      return { k, limite, maxOra, classi, coperture, nonCoperte: coperture.filter(c => !c.docente).length, disposizione, soloCompresente, scioperanti: [...scioperanti] };
    }

    if (ev.riduzione !== null && ev.riduzione !== undefined) return Object.assign(prova(ev.riduzione), { automatica: false });
    // automatica: la riduzione più piccola che copre tutto (se nessuna basta, quella con meno ore scoperte)
    let migliore = null;
    for (let k = 0; k <= MAX_RIDUZIONE && k < maxOra; k++) {
      const r = prova(k);
      if (!r.nonCoperte) return Object.assign(r, { automatica: true });
      if (!migliore || r.nonCoperte < migliore.nonCoperte) migliore = r;
    }
    return Object.assign(migliore, { automatica: true });
  }

  // La lezione «di chi sciopera» in quella classe e ora (serve per registrare la vigilanza come sostituzione)
  function lezioneDaCoprire(ev, cid, h) {
    const mo = m(), D = mo.orario(), giorno = mo.giornoOrario(ev.data);
    const l = (D.lezioniCurricolari || D.lezioni).find(x => x.giorno === giorno && x.ora === h && x.classe === cid && !x.compresenza);
    return l ? Object.assign({ assente: l.docente }, l) : null;
  }

  // Quello che si pubblica e si comunica, per ogni classe (niente nomi di chi sciopera)
  function esitoDa(r) {
    const classi = [];
    r.classi.forEach(i => {
      // da = la classe da cui viene il docente spostato (lì resta il compresente): l'app lo scrive anche su quella lezione
      const vig = r.coperture.filter(c => c.classe === i.id && c.docente).map(c => Object.assign({ ora: c.ora, docente: c.docente }, c.tipo === 'spostato' ? { da: c.da } : {}));
      const scop = r.coperture.filter(c => c.classe === i.id && !c.docente).map(c => c.ora);
      const primo = i.ore[0], ultimo = i.ore[i.ore.length - 1];
      if (i.nonEntra || i.entra > primo || i.esce < ultimo || vig.length || scop.length) {
        classi.push({ classe: i.id, nonEntra: i.nonEntra, entra: i.nonEntra ? null : (i.entra > primo ? i.entra : null),
          esce: i.nonEntra ? null : (i.esce < ultimo ? i.esce : null), vigilanza: vig, scoperte: scop });
      }
    });
    return { riduzione: r.k, classi };
  }

  // ---------- Azioni ----------
  function permesso() {
    if (m().stato().puoFare) return true;
    m().avvisa('Solo chi è nel foglio «Autorizzazioni» può confermare il piano: prima verifica la tua autorizzazione.');
    return false;
  }

  // il modulo: restano scelti anche quando la pagina si ridisegna (i nomi del file solo qui, in memoria)
  const scelta = { data: '', tipo: 'sciopero', ore: new Set(), letto: null, nomeFile: '', errore: '' };

  async function leggiFile(file) {
    scelta.errore = ''; scelta.letto = null; scelta.nomeFile = file.name;
    m().ridisegna();
    try {
      scelta.letto = await leggiAdesioni(file);
      // le compresenze aggiornate dal Foglio Compresenze, sostegno compreso (dato delicato: resta solo in memoria):
      // servono a sapere chi c'è in classe (chi prepara il piano può vederle)
      if (typeof Compresenze !== 'undefined') { Compresenze.impostaSostegno(true); await Compresenze.scarica(); }
    } catch (e) { scelta.errore = e.message; }
    m().ridisegna();
  }

  function prepara(iso) {
    const mo = m(), giorno = mo.giornoOrario(iso);
    if (!giorno) { mo.avvisa('In questo giorno non c\'è lezione.'); return; }
    if (!scelta.letto) { mo.avvisa('Carica prima il file delle adesioni.'); return; }
    const oreGiorno = [...new Set(mo.orario().lezioni.filter(l => l.giorno === giorno).map(l => l.ora))].sort((a, b) => a - b);
    const ore = scelta.tipo === 'sciopero' ? oreGiorno : [...scelta.ore].sort((a, b) => a - b);
    if (!ore.length) { mo.avvisa('Per l\'assemblea scegli le ore.'); return; }
    const gia = eventoDel(iso);
    if (gia && gia.confermato) { mo.avvisa('In questo giorno c\'è già uno sciopero confermato: prima toglilo.'); return; }
    eventi = eventi.filter(e => e.data !== iso);
    const L = scelta.letto;
    eventi.push({ id: nuovoId(), data: iso, tipo: scelta.tipo, ore, potenziali: L.potenziali.slice(), esclusi: [], riduzione: null, forzate: {},
      confermato: false, esito: null, conteggi: { potenziali: L.potenziali.length, nonInformati: L.nonInformati, negati: L.negati, nonTrovati: L.nonTrovati.length } });
    salva();
    scelta.letto = null; scelta.nomeFile = ''; scelta.ore.clear();
    mo.avvisa(`🧪 Simulazione: ${L.potenziali.length} potenziali scioperanti. Il piano è in «Ore da coprire»: niente è registrato finché non premi «✔ Conferma il piano».`);
    mo.ridisegna();
    const p = document.getElementById('sost-pianoSciopero'); if (p) p.scrollIntoView({ behavior: 'smooth' });
  }

  async function conferma(iso) {
    const ev = eventoDel(iso); if (!ev || inCorso || !permesso()) return;
    const mo = m(), r = calcola(ev); if (!r) return;
    inCorso = true; mo.ridisegna();
    let n = 0;
    try {
      for (const c of r.coperture.filter(x => x.docente)) {
        const l = lezioneDaCoprire(ev, c.classe, c.ora); if (!l) continue;
        // chi vigila è sempre nella sua ora di servizio: nessun +1 nel conteggio
        await mo.assegna(ev.data, l, c.docente, { reindirizzato: true, sciopero: ev.id, silenzioso: true });
        n++;
      }
      ev.esito = esitoDa(r); ev.confermato = true; salva();
      mo.avvisa(`✔ Piano confermato: ${n} ${n === 1 ? 'vigilanza registrata' : 'vigilanze registrate'}` + (r.k ? `, orario di tutta la scuola ridotto di ${r.k} ${r.k === 1 ? 'ora' : 'ore'}` : '') + '.');
    } finally { inCorso = false; mo.ridisegna(); }
  }

  async function azzera(iso) {
    const ev = eventoDel(iso); if (!ev) return;
    const mo = m();
    if (!ev.confermato) {
      if (!confirm('Cancellare la simulazione dello sciopero / assemblea di questo giorno?')) return;
    } else {
      if (!permesso()) return;
      if (!confirm('Togliere il piano già confermato? Vengono annullate anche le vigilanze registrate.')) return;
      for (const s of mo.registroDel(iso).filter(s => s.sciopero === ev.id)) await mo.annulla(s);
    }
    eventi = eventi.filter(e => e.id !== ev.id); salva();
    mo.avvisa('Sciopero / assemblea tolto.'); mo.ridisegna();
  }

  // ---------- Testi per classi, stampa e comunicazione ----------
  const oraTesto = h => h + 'ª ora';
  // [3] -> "3ª ora", [3, 4] -> "3ª e 4ª ora", [2, 3, 5] -> "2ª, 3ª e 5ª ora"
  const elencoOre = ore => { const n = ore.map(h => h + 'ª'); return (n.length > 1 ? n.slice(0, -1).join(', ') + ' e ' + n[n.length - 1] : n[0]) + ' ora'; };
  function righeClassi(r) {
    const mo = m(), out = [];
    [...r.classi.values()].sort((a, b) => numerico(mo.nome('classe', a.id), mo.nome('classe', b.id))).forEach(i => {
      const primo = i.ore[0], ultimo = i.ore[i.ore.length - 1];
      const vig = r.coperture.filter(c => c.classe === i.id);
      if (!(i.nonEntra || i.entra > primo || i.esce < ultimo || vig.length)) return;
      out.push({
        classe: mo.nome('classe', i.id),
        entrata: i.nonEntra ? 'non è garantito il servizio' : i.entra > primo ? `alle ${inizioOra(i.entra)} (${oraTesto(i.entra)})` : '',
        uscita: i.nonEntra ? '' : i.esce < ultimo ? `alle ${fineOra(i.esce)} (dopo la ${oraTesto(i.esce)})` : '',
        vigilanza: vig.map(c => ({ ora: c.ora, docente: c.docente }))
      });
    });
    return out;
  }

  // Tabella «Classi coperte solo dal compresente» (piano a schermo e stampa interna; mai nella comunicazione alle famiglie)
  function tabellaCompresenteHtml(r) {
    if (!r.soloCompresente || !r.soloCompresente.length) return '';
    const mo = m(), nomi = elenco => elenco.map(id => esc(mo.nomeDocente(id))).join(', ');
    return `<div class="tablewrap"><table class="sost-tabella"><caption>Classi coperte solo dal compresente: da controllare il giorno stesso
      (documento interno, non per le famiglie)</caption>
      <thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Potenzialmente assente</th><th scope="col">Resta in classe</th></tr></thead>
      <tbody>${r.soloCompresente.map(x => `<tr><th scope="row">${esc(oraTesto(x.ora))}</th><td>${esc(mo.nome('classe', x.classe))}</td>
        <td>${nomi(x.assenti)}</td><td><b>${nomi(x.restano)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }

  function stampa(iso) {
    const ev = eventoDel(iso), r = ev && calcola(ev); if (!r) return;
    const mo = m(), nome = id => esc(mo.nomeDocente(id)), righe = righeClassi(r);
    const box = document.createElement('div');
    box.className = 'sost-stampabile us-piano-stampa';
    box.innerHTML = `<h2>✊ ${esc(TIPI[ev.tipo])} · ${esc(dataLunga(iso))}</h2>
      ${ev.confermato ? '' : '<p><b>SIMULAZIONE – non ancora confermata</b></p>'}
      <p>Potenziali scioperanti: ${r.scioperanti.length}${r.k ? ` · orario di tutta la scuola ridotto di ${r.k} ${r.k === 1 ? 'ora' : 'ore'} (ultima ora: ${oraTesto(r.limite)})` : ''}.</p>
      <table class="sost-tabella"><caption>Classi con variazioni</caption>
        <thead><tr><th scope="col">Classe</th><th scope="col">Entrata posticipata</th><th scope="col">Uscita anticipata</th><th scope="col">Vigilanza</th></tr></thead>
        <tbody>${righe.map(x => `<tr><th scope="row">${esc(x.classe)}</th><td>${esc(x.entrata)}</td><td>${esc(x.uscita)}</td>
          <td>${x.vigilanza.map(v => oraTesto(v.ora) + ': ' + (v.docente ? nome(v.docente) : '<b>DA COPRIRE</b>')).join('<br>')}</td></tr>`).join('')}</tbody></table>
      ${r.disposizione.length ? `<p><b>A disposizione:</b> ${r.disposizione.map(d => nome(d.docente)).join(', ')}.</p>` : ''}
      ${tabellaCompresenteHtml(r)}`;
    document.body.append(box);
    document.body.classList.add('sost-in-stampa', 'us-stampa-piano');
    window.addEventListener('afterprint', () => { document.body.classList.remove('sost-in-stampa', 'us-stampa-piano'); box.remove(); }, { once: true });
    window.print();
  }

  // La comunicazione alle famiglie: un documento Word (.doc) da controllare e inviare (senza nomi di docenti)
  function scaricaComunicazione(iso) {
    const ev = eventoDel(iso), r = ev && calcola(ev); if (!r) return;
    const mo = m(), righe = righeClassi(r);
    const scuola = (typeof S !== 'undefined' && S.meta && S.meta.nome) || 'Istituto Comprensivo di Almese';
    const cosa = ev.tipo === 'sciopero' ? 'dello sciopero' : 'dell\'assemblea sindacale';
    const html = `<html><head><meta charset="utf-8"><title>Comunicazione alle famiglie</title>
      <style>body{font-family:Arial,sans-serif;font-size:11pt} table{border-collapse:collapse;width:100%} th,td{border:1px solid #444;padding:4px 6px;text-align:left;vertical-align:top}</style></head><body>
      <p><b>${esc(scuola)}</b></p>
      <p>Alle famiglie degli alunni</p>
      <p><b>Oggetto: ${esc(TIPI[ev.tipo])} del ${esc(dataLunga(iso))} – variazioni dell'orario delle lezioni</b></p>
      <p>Si comunica che, in occasione ${cosa} del ${esc(dataLunga(iso))}, sulla base delle comunicazioni volontarie del personale
        non è possibile garantire il regolare svolgimento delle lezioni. Per le classi indicate sono previste le seguenti variazioni:</p>
      <table><thead><tr><th>Classe</th><th>Entrata</th><th>Uscita</th><th>Note</th></tr></thead><tbody>
      ${righe.map(x => `<tr><td>${esc(x.classe)}</td><td>${esc(x.entrata || 'regolare')}</td><td>${esc(x.uscita || (x.entrata === 'non è garantito il servizio' ? '' : 'regolare'))}</td>
        <td>${x.vigilanza.length ? esc('Nella ' + elencoOre(x.vigilanza.map(v => v.ora)) + ' sarà garantita solo la vigilanza: non sarà possibile svolgere la lezione.') : ''}</td></tr>`).join('')}
      </tbody></table>
      <p>Per le classi non indicate l'orario è regolare${r.k ? `, tranne l'uscita di tutte le classi alle ${esc(fineOra(r.limite))} (dopo la ${oraTesto(r.limite)})` : ''}.
        Le variazioni potrebbero cambiare il giorno stesso, in base all'effettiva adesione del personale.</p>
      <p>Cordiali saluti.</p><p style="text-align:right">Il Dirigente Scolastico</p></body></html>`;
    const url = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
    const a = document.createElement('a'); a.href = url; a.download = `Comunicazione-${ev.tipo}-${iso}.doc`;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    mo.avvisa('📄 Comunicazione scaricata: aprila con Word, controllala e inviala alle famiglie.');
  }

  // ---------- Disegno ----------
  const legati = new WeakSet();
  const lega = box => { if (!legati.has(box)) { legati.add(box); box.addEventListener('click', clic); box.addEventListener('change', cambio); } };

  function disegnaModulo(box, iso) {
    const mo = m(), D = mo.orario(); if (!D) return;
    lega(box); caricaCampanella();
    if (scelta.data !== iso) { scelta.data = iso; scelta.ore.clear(); }
    const giorno = mo.giornoOrario(iso);
    if (!giorno) { box.innerHTML = '<p class="hint">In questo giorno non c\'è lezione.</p>'; return; }
    const oreGiorno = [...new Set(D.lezioni.filter(l => l.giorno === giorno).map(l => l.ora))].sort((a, b) => a - b);
    const L = scelta.letto, ev = eventoDel(iso);
    box.innerHTML = (ev ? `<p class="hint">In questo giorno c'è già: <b>${esc(TIPI[ev.tipo])}</b> (${ev.confermato ? '✔ confermato' : '🧪 simulazione'}). Il piano è in «Ore da coprire».</p>` : '') +
      `<p class="hint">Carica il file delle adesioni: sono potenziali scioperanti quelli con la presa visione e con adesione confermata,
        «non ha ancora maturato una decisione» o vuota. Il file si legge solo su questo computer: i nomi non vengono salvati.</p>
      <fieldset class="sost-ore"><legend>Che cosa</legend>
        ${Object.entries(TIPI).map(([k, n]) => `<label class="sost-casella"><input type="radio" name="sc-tipo" data-sc="tipo" value="${k}"${scelta.tipo === k ? ' checked' : ''}> ${n}</label>`).join('')}</fieldset>
      ${scelta.tipo === 'assemblea' ? `<fieldset class="sost-ore"><legend>Ore dell'assemblea</legend>${oreGiorno.map(h =>
        `<label class="sost-casella"><input type="checkbox" data-sc="ora" value="${h}"${scelta.ore.has(h) ? ' checked' : ''}> ${esc(mo.testoOra(h))}</label>`).join('')}</fieldset>` : ''}
      <label class="fl">File delle adesioni (.xlsx, .ods o .csv)
        <input type="file" data-sc="file" accept=".xlsx,.ods,.csv"></label>
      ${scelta.errore ? `<p class="sost-attenzione">⚠️ ${esc(scelta.errore)}.</p>` : ''}
      ${scelta.nomeFile && !L && !scelta.errore ? '<p class="hint">Leggo il file…</p>' : ''}
      ${L ? `<p>📄 ${esc(scelta.nomeFile)}: <b>${L.potenziali.length} potenziali scioperanti</b> · ${L.nonInformati} senza presa visione · ${L.negati} «adesione negata» (non contano)</p>
        ${L.nonTrovati.length ? `<p class="sost-attenzione">⚠️ Non trovati nell'orario (controlla il nome): ${esc(L.nonTrovati.join(', '))}</p>` : ''}` : ''}
      <button type="button" class="btn" data-sc="prepara"${L ? '' : ' disabled'}>🧪 Prepara il piano (simulazione)</button>`;
  }

  /*
    L'elenco dei potenziali scioperanti, sempre visibile e modificabile (per esempio dopo l'email di un docente che non sciopera):
    «✕ Non sciopera» lo toglie, «↩ Rimetti» lo riporta, «+ Aggiungi» mette un docente che non era nel file.
    Ogni modifica ricalcola subito il piano. Con il piano confermato si modifica solo dopo «✎ Riapri il piano».
  */
  function elencoPotenzialiHtml(ev, iso) {
    const mo = m(), nome = id => esc(mo.nomeDocente(id)), fermo = ev.confermato ? ' disabled' : '';
    const perNome = (a, b) => mo.nomeDocente(a).localeCompare(mo.nomeDocente(b), 'it');
    const tolti = new Set(ev.esclusi || []);
    const attivi = ev.potenziali.filter(id => !tolti.has(id)).sort(perNome);
    const esclusi = ev.potenziali.filter(id => tolti.has(id)).sort(perNome);
    const altri = mo.orario().docente.filter(t => !ev.potenziali.includes(t.id)).map(t => t.id).sort(perNome);
    return `<section class="sc-potenziali" aria-label="Potenziali scioperanti">
      <h4>Potenziali scioperanti: ${attivi.length}</h4>
      ${ev.confermato ? '<p class="hint">Il piano è confermato: per cambiare l\'elenco premi «✎ Riapri il piano».</p>'
        : '<p class="hint">Se un docente comunica che non sciopera, premi «✕ Non sciopera»: il piano si ricalcola da solo.</p>'}
      <ul class="sost-assenze">${attivi.map(id => `<li><span><strong>${nome(id)}</strong></span>
        <button type="button" class="btn ghost sm" data-sc="togliPot" data-id="${esc(id)}"${fermo} aria-label="${nome(id)} non sciopera: toglilo dall'elenco">✕ Non sciopera</button></li>`).join('')
        || '<li><span class="hint">Nessuno.</span></li>'}</ul>
      ${esclusi.length ? `<p class="hint">Tolti (non scioperano): ${esclusi.map(id => `${nome(id)} <button type="button" class="btn ghost sm" data-sc="rimettiPot" data-id="${esc(id)}"${fermo}>↩ Rimetti</button>`).join(' ')}</p>` : ''}
      <div class="row"><label class="fl" style="flex-direction:row;align-items:center;gap:6px">Aggiungi un docente
        <select data-sc="nuovoPot"${fermo}><option value="">—</option>${altri.map(id => `<option value="${esc(id)}">${nome(id)}</option>`).join('')}</select></label>
        <button type="button" class="btn sm" data-sc="aggiungiPot"${fermo}>+ Aggiungi</button>
        <button type="button" class="btn sm" data-sc="rigenera" data-data="${esc(iso)}"${fermo}>🔄 Rigenera il piano</button></div>
    </section>`;
  }

  // Modifiche all'elenco e al piano (solo in simulazione): si salvano e il piano si ridisegna ricalcolato
  function modifica(iso, cambia) {
    const ev = eventoDel(iso); if (!ev || ev.confermato) return;
    cambia(ev); salva(); m().ridisegna();
  }

  // «✎ Riapri il piano»: annulla le vigilanze registrate e torna alla simulazione (l'elenco e le scelte restano)
  async function riapri(iso) {
    const ev = eventoDel(iso); if (!ev || !ev.confermato || inCorso || !permesso()) return;
    if (!confirm('Riaprire il piano? Le vigilanze già registrate vengono annullate; poi potrai modificarlo e confermarlo di nuovo.')) return;
    const mo = m();
    inCorso = true; mo.ridisegna();
    try {
      for (const s of mo.registroDel(iso).filter(s => s.sciopero === ev.id)) await mo.annulla(s);
      ev.confermato = false; ev.esito = null; salva();
      mo.avvisa('✎ Piano riaperto: modificalo e premi di nuovo «✔ Conferma il piano».');
    } finally { inCorso = false; mo.ridisegna(); }
  }

  function disegnaPiano(box, iso) {
    if (!box) return;
    lega(box); caricaCampanella();
    const ev = eventoDel(iso), r = ev && calcola(ev);
    if (!r) { box.innerHTML = ''; return; }
    const mo = m(), nome = id => esc(mo.nomeDocente(id)), cl = id => esc(mo.nome('classe', id));
    const TIPO = { spostato: 'curricolare spostato da', recuperato: 'ora recuperata dal fondo',
    };
    const nota = c => c.tipo === 'spostato' ? `${TIPO.spostato} ${cl(c.da)} (resta il compresente)` : TIPO[c.tipo] || '⚠ nessuno disponibile';
    const opz = c => `<option value="">— nessuno —</option>` + c.alternative.map(a =>
      `<option value="${esc(a.id)}"${a.id === c.docente ? ' selected' : ''}>${nome(a.id)} · ${esc(a.tipo === 'spostato' ? 'da ' + mo.nome('classe', a.da) : TIPO[a.tipo])}</option>`).join('');
    const righe = righeClassi(r);
    const nascosti = new Set(ev.esclusi || []);
    box.innerHTML = `<article class="sost-ora sost-piano-uscita">
      <h3>✊ ${esc(TIPI[ev.tipo])}: piano proposto</h3>
      <p class="${ev.confermato ? 'hint' : 'sost-attenzione'}" role="status">${ev.confermato
        ? '✔ Piano confermato: le vigilanze sono registrate.' : '🧪 <b>Simulazione</b>: niente è ancora registrato. Controlla, cambia se serve, poi «✔ Conferma il piano».'}</p>
      <p class="sost-dettagli">${ev.tipo === 'assemblea' ? 'Ore dell\'assemblea: ' + esc(ev.ore.map(oraTesto).join(', ')) + ' · ' : ''}
        ${r.scioperanti.length} potenziali scioperanti su ${ev.potenziali.length}${ev.conteggi ? ` (dal file: ${ev.conteggi.nonInformati} senza presa visione, ${ev.conteggi.negati} negati${ev.conteggi.nonTrovati ? `, ${ev.conteggi.nonTrovati} non trovati` : ''})` : ''}</p>
      ${elencoPotenzialiHtml(ev, iso)}
      <label class="fl">Orario di tutta la scuola
        <select data-sc="riduzione"${ev.confermato ? ' disabled' : ''}>
          <option value="auto"${ev.riduzione == null ? ' selected' : ''}>automatico (proposta: ${r.k ? '−' + r.k + (r.k === 1 ? ' ora' : ' ore') : 'normale'})</option>
          ${[0, 1, 2, 3].filter(k => k < r.maxOra).map(k => `<option value="${k}"${ev.riduzione === k ? ' selected' : ''}>${k ? `ridotto di ${k} ${k === 1 ? 'ora' : 'ore'} (tutti escono alle ${esc(fineOra(r.maxOra - k))})` : 'normale'}</option>`).join('')}
        </select></label>
      ${righe.length ? `<div class="tablewrap"><table class="sost-tabella"><caption>Classi con variazioni</caption>
        <thead><tr><th scope="col">Classe</th><th scope="col">Entrata posticipata</th><th scope="col">Uscita anticipata</th><th scope="col">Vigilanza</th></tr></thead>
        <tbody>${righe.map(x => `<tr><th scope="row">${esc(x.classe)}</th><td>${esc(x.entrata)}</td><td>${esc(x.uscita)}</td>
          <td>${x.vigilanza.map(v => esc(oraTesto(v.ora))).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">✔ Nessuna classe con variazioni.</p>'}
      ${r.coperture.length ? `<div class="tablewrap"><table class="sost-tabella"><caption>Ore in mezzo alla giornata: chi fa la vigilanza</caption>
        <thead><tr><th scope="col">Ora</th><th scope="col">Classe</th><th scope="col">Vigila</th><th scope="col">Note</th></tr></thead>
        <tbody>${r.coperture.map(c => `<tr><th scope="row">${esc(oraTesto(c.ora))}</th><td>${cl(c.classe)}</td>
          <td><label class="sost-solo-lettori" for="sc-${esc(c.chiave)}">Chi vigila</label><select id="sc-${esc(c.chiave)}" data-sc="scegli" data-chiave="${esc(c.chiave)}"${ev.confermato ? ' disabled' : ''}>${opz(c)}</select></td>
          <td class="${c.docente ? '' : 'sost-attenzione'}">${nota(c)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${r.nonCoperte ? `<p class="sost-attenzione">⚠️ ${r.nonCoperte} ${r.nonCoperte === 1 ? 'ora resta scoperta' : 'ore restano scoperte'} anche riducendo l'orario: scegli a mano chi vigila.</p>` : ''}
      ${r.disposizione.length ? `<p><b>A disposizione</b> (ore recuperate dal fondo e non usate): ${r.disposizione.map(d => nome(d.docente)).join(', ')}.</p>` : ''}
      ${tabellaCompresenteHtml(r)}
      <div class="row">
        ${ev.confermato ? `<span class="tag ok">✔ Piano confermato</span>
          <button type="button" class="btn" data-sc="riapri" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>✎ Riapri il piano</button>` : `<button type="button" class="btn" data-sc="conferma" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>${inCorso ? 'Registro…' : '✔ Conferma il piano'}</button>`}
        <button type="button" class="btn" data-sc="stampa" data-data="${esc(iso)}">🖨️ Stampa il piano</button>
        <button type="button" class="btn" data-sc="comunicazione" data-data="${esc(iso)}">📄 Scarica la comunicazione alle famiglie</button>
        <button type="button" class="btn danger" data-sc="azzera" data-data="${esc(iso)}"${inCorso ? ' disabled' : ''}>${ev.confermato ? '↺ Togli il piano' : '↺ Azzera la simulazione'}</button>
      </div></article>`;
  }

  // ---------- Eventi ----------
  function clic(e) {
    const b = e.target.closest('button[data-sc]'); if (!b || b.disabled) return;
    const a = b.dataset.sc;
    if (a === 'prepara') prepara(scelta.data);
    else if (a === 'conferma') conferma(b.dataset.data);
    else if (a === 'stampa') stampa(b.dataset.data);
    else if (a === 'comunicazione') scaricaComunicazione(b.dataset.data);
    else if (a === 'azzera') azzera(b.dataset.data);
    else if (a === 'riapri') riapri(b.dataset.data);
    else {
      // elenco dei potenziali scioperanti e «Rigenera»: sul giorno mostrato nella scheda
      const iso = document.getElementById('sost-data') ? document.getElementById('sost-data').value : scelta.data;
      const id = b.dataset.id;
      if (a === 'togliPot') modifica(iso, ev => { ev.esclusi = (ev.esclusi || []).filter(x => x !== id).concat(id); });
      else if (a === 'rimettiPot') modifica(iso, ev => { ev.esclusi = (ev.esclusi || []).filter(x => x !== id); });
      else if (a === 'aggiungiPot') {
        const s = b.closest('.sc-potenziali').querySelector('[data-sc="nuovoPot"]');
        if (!s || !s.value) { m().avvisa('Scegli prima il docente da aggiungere.'); return; }
        const nuovo = s.value;
        modifica(iso, ev => { ev.potenziali = ev.potenziali.concat(nuovo); ev.esclusi = (ev.esclusi || []).filter(x => x !== nuovo); });
      }
      // «Rigenera»: si ricalcola da zero, senza le scelte fatte a mano (chi vigila, riduzione dell'orario)
      else if (a === 'rigenera') { modifica(iso, ev => { ev.forzate = {}; ev.riduzione = null; }); m().avvisa('🔄 Piano rigenerato.'); }
    }
  }
  function cambio(e) {
    const c = e.target.closest('[data-sc]'); if (!c) return;
    const a = c.dataset.sc, ev = eventoDel(document.getElementById('sost-data') ? document.getElementById('sost-data').value : scelta.data);
    if (a === 'file') { if (c.files && c.files[0]) leggiFile(c.files[0]); return; }
    if (a === 'nuovoPot') return;   // la tendina «Aggiungi un docente»: si usa con il tasto «+ Aggiungi», niente ridisegno
    if (a === 'tipo') scelta.tipo = c.value;
    else if (a === 'ora') { c.checked ? scelta.ore.add(Number(c.value)) : scelta.ore.delete(Number(c.value)); }
    else if (ev && !ev.confermato) {
      if (a === 'potenziale') { ev.esclusi = (ev.esclusi || []).filter(x => x !== c.value); if (!c.checked) ev.esclusi.push(c.value); }
      else if (a === 'riduzione') ev.riduzione = c.value === 'auto' ? null : Number(c.value);
      else if (a === 'scegli') { ev.forzate = ev.forzate || {}; ev.forzate[c.dataset.chiave] = c.value || '__nessuno'; }
      salva();
    }
    const selettore = a === 'scegli' ? `[data-sc="scegli"][data-chiave="${CSS.escape(c.dataset.chiave)}"]` : `[data-sc="${a}"][value="${CSS.escape(c.value)}"]`;
    m().ridisegna();
    const di = document.querySelector(selettore); if (di) di.focus();
  }

  // Se gli scioperi cambiano in un'altra scheda del browser, li rileggiamo
  window.addEventListener('storage', e => { if (e.key === 'sostituzioni.scioperi') eventi = Archivio.leggi('scioperi', []); });

  return { calcola, eventoDel, disegnaModulo, disegnaPiano, leggiAdesioni, esitoDa, inizioOra, fineOra };
})();

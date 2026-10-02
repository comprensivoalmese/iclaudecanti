/*
  impegni-drive.js – il calendario degli impegni su Google Drive (js/calendario.js).

  1. IMPORTARE (solo chi è autorizzato a Orario Facile, tasto «Importa dal Piano delle attività» del calendario):
     - il foglio del Piano annuale delle attività sta nella STESSA CARTELLA dei fogli di Orario Facile, cioè la cartella
       del Foglio «Database» (CONFIG.fileDatabaseOrario; se non si trova, CONFIG.cartellaPubblicazione);
     - cercaPiani() elenca i fogli di quella cartella con «Piano» nel nome (Excel, LibreOffice o Fogli Google);
     - scarica() li porta nel browser; salvaNellaCartella() ci mette il file scelto dal computer (senza convertirlo).
  2. PUBBLICARE: pubblica() scrive gli impegni letti in «impegni-pubblicati.json» nella cartella dei file pubblicati
     (CONFIG.cartellaPubblicazione, la stessa di orario e sostituzioni), che è condivisa con l'Istituto.
  3. LEGGERE: leggiPubblicati() lo legge con il permesso Google di chi ha fatto l'accesso (senza aprire finestre).

  Usa le funzioni di app/js/pubblica-drive.js (chiama, cerca, scriviFile) e i permessi di app/js/nomi.js.
*/
const ImpegniDrive = (() => {
  const API = 'https://www.googleapis.com/drive/v3/files';
  const CARICA = 'https://www.googleapis.com/upload/drive/v3/files';
  const NOME_PUBBLICATO = 'impegni-pubblicati.json';
  const TIPI = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    google: 'application/vnd.google-apps.spreadsheet'
  };

  const pronto = () => typeof PubblicaDrive !== 'undefined' && typeof NomiDocenti !== 'undefined' &&
    typeof CONFIG !== 'undefined' && !!CONFIG.googleClientId && !!CONFIG.cartellaPubblicazione;
  const tra = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

  // Una richiesta con il permesso di scrivere su Drive che restituisce dati binari (il file del piano)
  async function scaricaBinario(url, email) {
    const t = await NomiDocenti.gettone([PubblicaDrive.PERMESSO], email);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) throw new Error(r.status === 404 ? 'file non trovato su Drive' : 'errore ' + r.status + ' da Google Drive');
    return r.arrayBuffer();
  }

  // La cartella dei fogli di Orario Facile: quella che contiene il Foglio «Database»
  let cartella = '';
  async function cartellaFogli(email) {
    if (cartella) return cartella;
    if (CONFIG.fileDatabaseOrario) {
      try {
        const f = await PubblicaDrive.chiama(API + '/' + encodeURIComponent(CONFIG.fileDatabaseOrario) +
          '?fields=parents&supportsAllDrives=true', { email });
        if (f.parents && f.parents[0]) cartella = f.parents[0];
      } catch (e) { /* non si vede la cartella del Database: si usa quella dei file pubblicati */ }
    }
    return cartella || CONFIG.cartellaPubblicazione;
  }

  // I fogli con «Piano» nel nome nella cartella dei fogli di Orario Facile, dal più recente
  async function cercaPiani(email) {
    const dove = await cartellaFogli(email);
    const q = `${tra(dove)} in parents and trashed = false and name contains 'Piano' and (` +
      Object.values(TIPI).map(t => `mimeType = ${tra(t)}`).join(' or ') + ')';
    const r = await PubblicaDrive.chiama(API + '?orderBy=modifiedTime desc&pageSize=20&supportsAllDrives=true' +
      '&includeItemsFromAllDrives=true&fields=files(id,name,mimeType,modifiedTime)&q=' + encodeURIComponent(q), { email });
    return r.files || [];
  }

  // Scarica un foglio di Drive come File (un Foglio Google si scarica in formato Excel)
  async function scarica(f, email) {
    const google = f.mimeType === TIPI.google;
    const url = API + '/' + encodeURIComponent(f.id) +
      (google ? '/export?mimeType=' + encodeURIComponent(TIPI.xlsx) : '?alt=media&supportsAllDrives=true');
    const dati = await scaricaBinario(url, email);
    const nome = google ? f.name + '.xlsx' : f.name;
    return new File([dati], nome);
  }

  // Mette nella cartella dei fogli il file scelto dal computer (se c'è già un file con lo stesso nome lo sostituisce)
  async function salvaNellaCartella(file, email) {
    const dove = await cartellaFogli(email);
    const estensione = (file.name.split('.').pop() || '').toLowerCase();
    const tipo = TIPI[estensione] || 'application/octet-stream';
    const t = await NomiDocenti.gettone([PubblicaDrive.PERMESSO], email);
    const esistente = await PubblicaDrive.cerca(file.name, dove, '', email);
    let r;
    if (esistente) {
      r = await fetch(CARICA + '/' + encodeURIComponent(esistente) + '?uploadType=media&supportsAllDrives=true', {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': tipo }, body: file
      });
    } else {
      // file nuovo: nome e cartella insieme al contenuto ("multipart"), senza convertirlo in Foglio Google
      const confine = 'impegni' + Date.now();
      const corpo = new Blob([
        `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: file.name, parents: [dove], mimeType: tipo }) +
        `\r\n--${confine}\r\nContent-Type: ${tipo}\r\n\r\n`, file, `\r\n--${confine}--`]);
      r = await fetch(CARICA + '?uploadType=multipart&supportsAllDrives=true&fields=id', {
        method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + confine }, body: corpo
      });
    }
    if (!r.ok) throw new Error(r.status === 403 ? 'il tuo account non può scrivere nella cartella di Drive' : 'errore ' + r.status + ' da Google Drive');
    return { cartella: dove, sostituito: !!esistente };
  }

  // Pubblica gli impegni per tutti (impegni-pubblicati.json nella cartella dei file pubblicati)
  async function pubblica(dati, email) {
    const testo = JSON.stringify(dati);
    const id = CONFIG.fileImpegniPubblicati;
    if (id) {
      await PubblicaDrive.chiama(CARICA + '/' + encodeURIComponent(id) + '?uploadType=media&supportsAllDrives=true', {
        metodo: 'PATCH', tipo: 'application/json; charset=UTF-8', corpo: testo, email
      });
      return { id };
    }
    return PubblicaDrive.scriviFile(NOME_PUBBLICATO, CONFIG.cartellaPubblicazione, testo, email);
  }

  /*
    Legge gli impegni pubblicati su Drive SENZA aprire finestre di Google: serve il permesso di lettura già dato
    (lo chiedono i nomi dei docenti, vedi nomi.js). Lancia un errore se non si può: allora il calendario usa
    l'ultima copia salvata o dati/impegni.json da GitHub.
  */
  let idTrovato = '';
  async function leggiPubblicati() {
    if (!pronto()) throw new Error('Drive non configurato');
    const t = NomiDocenti.gettoneDisponibile([NomiDocenti.PERMESSO_DRIVE]) || NomiDocenti.gettoneDisponibile([PubblicaDrive.PERMESSO]);
    if (!t) throw new Error('manca il permesso di Google');
    const intestazioni = { headers: { Authorization: 'Bearer ' + t }, cache: 'no-cache' };
    let id = CONFIG.fileImpegniPubblicati || idTrovato;
    if (!id) {
      const q = `name = ${tra(NOME_PUBBLICATO)} and ${tra(CONFIG.cartellaPubblicazione)} in parents and trashed = false`;
      const r = await fetch(API + '?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(q), intestazioni);
      if (!r.ok) throw new Error('errore ' + r.status);
      const j = await r.json();
      if (!j.files || !j.files[0]) throw new Error('impegni non ancora pubblicati su Drive');
      id = idTrovato = j.files[0].id;
    }
    const r = await fetch(API + '/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', intestazioni);
    if (!r.ok) throw new Error('errore ' + r.status);
    return r.json();
  }

  return { pronto, cercaPiani, scarica, salvaNellaCartella, pubblica, leggiPubblicati, cartellaFogli };
})();

/*
  pubblica-drive.js – salva l'orario e le sostituzioni pubblicate in una cartella di Google Drive
  (tasti «📤 Pubblica orario» e «📤 Pubblica sostituzioni» di Orario Facile, vedi orario-facile/pubblica.js).

  Nella cartella CONFIG.cartellaPubblicazione ci sono:
  - orario-pubblicato.json        l'orario che l'app Luis@i mostra a tutti
  - sostituzioni-pubblicate.json  le assenze e le sostituzioni che l'app mostra nella tabella
  - la cartella «backup orario»   un backup completo per ogni giorno di pubblicazione
                                  ("backup orario 26-09-2026.json"; lo stesso giorno si sostituisce)
  I file si cercano per nome: la prima volta vengono creati, poi si aggiornano sempre gli stessi
  (così il loro ID, scritto in config.js, non cambia). I due file pubblicati vengono condivisi
  con «Chiunque abbia il link – Visualizzatore», perché l'app li legga anche sulle LIM senza accesso;
  contengono solo i codici dei docenti (DOC01…), come prima dati/orario.json su GitHub. I backup restano privati.

  Usa i permessi di Google di app/js/nomi.js (NomiDocenti.gettone), che restano solo in memoria.
*/
const PubblicaDrive = (() => {
  // Permesso per scrivere nelle cartelle di Drive (la prima volta Google chiede il consenso)
  const PERMESSO = 'https://www.googleapis.com/auth/drive';
  const API = 'https://www.googleapis.com/drive/v3/files';
  const CARICA = 'https://www.googleapis.com/upload/drive/v3/files';
  const TIPO_CARTELLA = 'application/vnd.google-apps.folder';
  const NOMI = { orario: 'orario-pubblicato.json', sostituzioni: 'sostituzioni-pubblicate.json', backup: 'backup orario' };

  const cartella = () => (typeof CONFIG !== 'undefined' && CONFIG.cartellaPubblicazione) || '';
  // L'orario (e la sua cartella «backup orario») può stare in un'altra cartella, per esempio su un Drive personale
  // dove la condivisione con link è permessa: CONFIG.cartellaOrario. Se è vuota si usa cartellaPubblicazione.
  const cartellaOrario = () => (typeof CONFIG !== 'undefined' && CONFIG.cartellaOrario) || cartella();
  const configurato = () => !!cartella() && typeof NomiDocenti !== 'undefined' && !!CONFIG.googleClientId;

  // Messaggi di errore di Google spiegati in italiano
  function spiega(stato, testo) {
    if (/has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(testo))
      return 'nel progetto Google Cloud va attivata la "Google Drive API"';
    if (stato === 404) return 'cartella o file non trovato su Drive, oppure il tuo account non può aprirli';
    if (stato === 403) return 'il tuo account non ha il permesso di scrivere nella cartella di Drive';
    if (stato === 401) return 'il permesso di Google è scaduto: riprova';
    return 'errore ' + stato + ' da Google Drive';
  }

  // Una richiesta a Drive con il permesso dell'utente; restituisce la risposta già letta (JSON)
  async function chiama(url, opzioni) {
    opzioni = opzioni || {};
    const t = await NomiDocenti.gettone([PERMESSO], opzioni.email);
    const r = await fetch(url, {
      method: opzioni.metodo || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + t }, opzioni.tipo ? { 'Content-Type': opzioni.tipo } : {}),
      body: opzioni.corpo
    });
    const testo = await r.text();
    if (!r.ok) { const e = new Error(spiega(r.status, testo)); e.stato = r.status; throw e; }
    return testo ? JSON.parse(testo) : {};
  }

  // Un testo tra apici per le ricerche di Drive: "l'orario" -> 'l\'orario'
  const tra = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

  // Cerca per nome un file (o una cartella) dentro una cartella: restituisce l'ID oppure ''
  async function cerca(nome, dentro, tipo, email) {
    let q = `name = ${tra(nome)} and ${tra(dentro)} in parents and trashed = false`;
    if (tipo) q += ` and mimeType = ${tra(tipo)}`;
    const r = await chiama(API + '?fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true&q=' + encodeURIComponent(q), { email });
    return r.files && r.files[0] ? r.files[0].id : '';
  }

  // La cartella «nome» dentro «dentro»: se non c'è la crea
  async function cartellaDentro(nome, dentro, email) {
    const id = await cerca(nome, dentro, TIPO_CARTELLA, email);
    if (id) return id;
    const nuova = await chiama(API + '?supportsAllDrives=true&fields=id', {
      metodo: 'POST', tipo: 'application/json', email,
      corpo: JSON.stringify({ name: nome, mimeType: TIPO_CARTELLA, parents: [dentro] })
    });
    return nuova.id;
  }

  /*
    Scrive un file JSON nella cartella: se esiste già (stesso nome) ne cambia il contenuto,
    altrimenti lo crea. Restituisce { id, nuovo }.
  */
  async function scriviFile(nome, dentro, testo, email) {
    const id = await cerca(nome, dentro, '', email);
    if (id) {
      await chiama(CARICA + '/' + encodeURIComponent(id) + '?uploadType=media&supportsAllDrives=true', {
        metodo: 'PATCH', tipo: 'application/json; charset=UTF-8', corpo: testo, email
      });
      return { id, nuovo: false };
    }
    // file nuovo: si mandano insieme le informazioni (nome, cartella) e il contenuto ("multipart")
    const confine = 'orariofacile' + Date.now();
    const corpo = `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: nome, parents: [dentro], mimeType: 'application/json' }) +
      `\r\n--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${testo}\r\n--${confine}--`;
    const nuovo = await chiama(CARICA + '?uploadType=multipart&supportsAllDrives=true&fields=id', {
      metodo: 'POST', tipo: 'multipart/related; boundary=' + confine, corpo, email
    });
    return { id: nuovo.id, nuovo: true };
  }

  // Condivide un file con «Chiunque abbia il link – Visualizzatore». Restituisce false se la scuola lo vieta.
  async function condividiConLink(id, email) {
    try {
      await chiama(API + '/' + encodeURIComponent(id) + '/permissions?supportsAllDrives=true', {
        metodo: 'POST', tipo: 'application/json', email, corpo: JSON.stringify({ type: 'anyone', role: 'reader' })
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Data di oggi come "26-09-2026" (per il nome del backup)
  function dataOggi() {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  }

  // Cambia il contenuto di un file già esistente, dato il suo ID (il proprietario e la condivisione non cambiano)
  async function aggiornaFile(id, testo, email) {
    await chiama(CARICA + '/' + encodeURIComponent(id) + '?uploadType=media&supportsAllDrives=true', {
      metodo: 'PATCH', tipo: 'application/json; charset=UTF-8', corpo: testo, email
    });
    return { id, nuovo: false, condiviso: true, collegato: true };
  }

  /*
    Scrive un file pubblicato:
    - se il suo ID è già in config.js aggiorna SEMPRE quel file (è quello che l'app legge). Così il file resta del suo
      proprietario (per esempio un Drive personale, dove la condivisione con link è permessa) anche se pubblica
      un account della scuola che ha solo il permesso di modifica;
    - altrimenti lo cerca per nome nella cartella (o lo crea) e prova a condividerlo con link.
  */
  async function pubblica(nome, dentro, testo, idInConfig, email) {
    if (idInConfig) return aggiornaFile(idInConfig, testo, email);
    const f = await scriviFile(nome, dentro, testo, email);
    f.condiviso = f.id === idInConfig ? true : await condividiConLink(f.id, email);
    f.collegato = f.id === idInConfig;   // false = l'app non legge ancora questo file: l'ID va scritto in config.js
    return f;
  }

  /*
    Pubblica l'orario (testoOrario) e salva il backup completo del giorno (testoBackup).
    Restituisce { id, nuovo, condiviso, collegato, backup: nome del backup }.
  */
  async function pubblicaOrario(testoOrario, testoBackup, email) {
    if (!configurato()) throw new Error('in config.js manca la cartella di Drive (cartellaPubblicazione) o l\'ID client di Google');
    const f = await pubblica(NOMI.orario, cartellaOrario(), testoOrario, CONFIG.fileOrarioPubblicato, email);
    const cartellaBackup = await cartellaDentro(NOMI.backup, cartellaOrario(), email);
    f.backup = 'backup orario ' + dataOggi() + '.json';
    await scriviFile(f.backup, cartellaBackup, testoBackup, email);   // stesso giorno: sostituisce il backup
    return f;
  }

  // Pubblica le sostituzioni. Restituisce { id, nuovo, condiviso, collegato }.
  async function pubblicaSostituzioni(testo, email) {
    if (!configurato()) throw new Error('in config.js manca la cartella di Drive (cartellaPubblicazione) o l\'ID client di Google');
    return pubblica(NOMI.sostituzioni, cartella(), testo, CONFIG.fileSostituzioniPubblicate, email);
  }

  return { configurato, pubblicaOrario, pubblicaSostituzioni, NOMI };
})();

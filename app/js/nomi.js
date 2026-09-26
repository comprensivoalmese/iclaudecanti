/*
  nomi.js – i nomi veri dei docenti, letti da un file riservato su Google Drive.

  Il repository è pubblico, quindi nell'orario i docenti sono solo codici (DOC01, DOC02…).
  La corrispondenza codice → nome è nella scheda Docenti del Foglio database dell'orario (config.js,
  "fileDatabaseOrario": colonne Codice, Cognome, Nome), condiviso in lettura con tutto l'Istituto (docenti e studenti).
  Finché in config.js c'è ancora "fileNomiDocenti" (il vecchio file separato Codice;Cognome;Nome) si legge quello.
  Chi ha il permesso di aprire il file vede i nomi: la pagina chiede a Google di leggerlo a nome dell'utente.
  Se l'account non ha accesso, Google rifiuta e restano i codici.

  I nomi restano SOLO IN MEMORIA: mai in localStorage, mai nei backup o nei file pubblicati.
  Il file può essere un CSV (Codice;Cognome;Nome) o un Foglio Google con le stesse colonne.
*/
const NomiDocenti = (() => {
  const PERMESSO = 'https://www.googleapis.com/auth/drive.readonly';
  let libreria = null;

  // La libreria di Google per i permessi (la stessa dell'accesso, se è già caricata non la ricarica)
  function caricaLibreria() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!libreria) {
      libreria = new Promise((ok, ko) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.onload = ok;
        s.onerror = () => { libreria = null; ko(new Error('non riesco a contattare Google (sei in rete?)')); };
        document.head.append(s);
      });
    }
    return libreria;
  }

  // Il "gettone" di Google resta in memoria (mai salvato) fino alla scadenza, così non si richiede a ogni uso.
  // Altri file (es. le Sostituzioni, per il foglio del conteggio ore) possono chiedere permessi in più.
  let ricordato = null;   // { gettone, scadenza, permessi: Set }

  // Gettone già ottenuto che comprende tutti i permessi richiesti, oppure null (non apre finestre)
  function gettoneDisponibile(permessi) {
    const r = ricordato;
    return r && r.scadenza > Date.now() + 60000 && permessi.every(p => r.permessi.has(p)) ? r.gettone : null;
  }

  // Chiede a Google un gettone con questi permessi (la prima volta compare la richiesta di consenso).
  // Se la libreria di Google è già caricata la finestra si apre SUBITO, senza attese: i browser (soprattutto Safari
  // su iPhone/iPad) la permettono solo se si apre nello stesso istante del tocco dell'utente.
  function gettone(permessi, email) {
    const pronto = gettoneDisponibile(permessi);
    if (pronto) return Promise.resolve(pronto);
    if (window.google && google.accounts && google.accounts.oauth2) return chiediGettone(permessi, email);
    return caricaLibreria().then(() => chiediGettone(permessi, email));
  }
  function chiediGettone(permessi, email) {
    return new Promise((ok, ko) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.googleClientId,
        scope: permessi.join(' '),
        hd: CONFIG.dominio,
        login_hint: email || '',
        callback: r => {
          if (r.error) { ko(new Error(r.error_description || r.error)); return; }
          const concessi = new Set(String(r.scope || '').split(' '));
          if (!permessi.every(p => concessi.has(p))) { ko(new Error('Google non ha dato tutti i permessi richiesti')); return; }
          ricordato = { gettone: r.access_token, scadenza: Date.now() + (Number(r.expires_in) || 3600) * 1000, permessi: concessi };
          ok(r.access_token);
        },
        error_callback: e => ko(new Error(e && e.type === 'popup_closed' ? 'la finestra di Google è stata chiusa'
          : e && e.type === 'popup_failed_to_open' ? 'il browser ha bloccato la finestra di Google: consenti i popup'
          : 'Google non ha dato il permesso'))
      });
      client.requestAccessToken({ prompt: '' });
    });
  }

  function spiega(stato, testo) {
    if (stato === 404) return 'file non trovato, oppure il tuo account non ha il permesso di aprirlo';
    if (stato === 403 && /has not been used|is disabled|accessNotConfigured/i.test(testo))
      return 'nel progetto Google Cloud va attivata la "Google Drive API"';
    if (stato === 403) return 'il tuo account non ha il permesso di leggere il file dei nomi';
    if (stato === 401) return 'il permesso di Google è scaduto: riprova';
    return 'errore ' + stato + ' da Google Drive';
  }

  async function scarica(t) {
    const base = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(CONFIG.fileNomiDocenti);
    const intestazioni = { Authorization: 'Bearer ' + t };
    const info = await fetch(base + '?fields=mimeType&supportsAllDrives=true', { headers: intestazioni });
    if (!info.ok) throw new Error(spiega(info.status, await info.text()));
    const { mimeType } = await info.json();
    // un Foglio Google si "esporta" in CSV; un file caricato (CSV) si scarica così com'è
    const url = mimeType === 'application/vnd.google-apps.spreadsheet'
      ? base + '/export?mimeType=text/csv'
      : base + '?alt=media&supportsAllDrives=true';
    const r = await fetch(url, { headers: intestazioni });
    if (!r.ok) throw new Error(spiega(r.status, await r.text()));
    const byte = new Uint8Array(await r.arrayBuffer());
    let testo = new TextDecoder('utf-8').decode(byte);
    if (testo.includes('�')) testo = new TextDecoder('windows-1252').decode(byte);   // salvato da Excel
    return testo.replace(/^﻿/, '');
  }

  // "ROMBOLA'" → "Rombolà", "D'ALESSANDRO" → "D'Alessandro", "DI STEFANO" → "Di Stefano"
  function bello(s) {
    const accento = { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù' };
    return String(s || '').trim().toLowerCase()
      .replace(/([aeiou])['’](?=\s|$)/g, (m, v) => accento[v])
      .replace(/(^|[\s'’-])(\p{L})/gu, (m, prima, lettera) => prima + lettera.toUpperCase());
  }

  // Map "DOC01" → { cognome, nome }
  function interpreta(testo) {
    const righe = testo.split(/\r?\n/).filter(r => r.trim());
    if (!righe.length) throw new Error('il file dei nomi è vuoto');
    const sep = [';', '\t', ','].sort((a, b) => righe[0].split(b).length - righe[0].split(a).length)[0];
    const celle = r => r.split(sep).map(x => x.trim().replace(/^"|"$/g, ''));
    const int = celle(righe[0]).map(x => x.toLowerCase());
    const cC = int.indexOf('codice'), cCo = int.indexOf('cognome'), cN = int.indexOf('nome');
    if (cC < 0 || cCo < 0) throw new Error('nel file dei nomi servono le colonne Codice e Cognome (e Nome)');
    const mappa = new Map();
    righe.slice(1).forEach(r => {
      const c = celle(r), codice = (c[cC] || '').toUpperCase();
      if (codice && c[cCo]) mappa.set(codice, { cognome: bello(c[cCo]), nome: cN >= 0 ? bello(c[cN]) : '' });
    });
    if (!mappa.size) throw new Error('nel file dei nomi non ci sono docenti');
    return mappa;
  }

  /*
    I nomi dal Foglio database dell'orario (CONFIG.fileDatabaseOrario, vedi orario-facile/DATABASE.md):
    scheda Docenti, colonna A codice, B cognome, C nome. Si leggono solo quelle colonne, quindi è veloce.
  */
  const PERMESSO_FOGLI = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  async function daDatabase(t) {
    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(CONFIG.fileDatabaseOrario) +
      '/values/' + encodeURIComponent('Docenti!A2:C121');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + t } });
    if (!r.ok) {
      const testo = await r.text();
      if (r.status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(testo))
        throw new Error('nel progetto Google Cloud va attivata la "Google Sheets API"');
      throw new Error(spiega(r.status, testo));
    }
    const righe = (await r.json()).values || [];
    const mappa = new Map();
    righe.forEach(riga => {
      const codice = String(riga[0] || '').trim().toUpperCase(), cognome = String(riga[1] || '').trim();
      const nome = String(riga[2] || '').trim();
      if (codice && (cognome || nome)) mappa.set(codice, { cognome: bello(cognome), nome: bello(nome) });
    });
    if (!mappa.size) throw new Error('nella scheda Docenti del database non ci sono ancora i nomi');
    return mappa;
  }

  // Da dove si leggono i nomi: il vecchio file dei nomi (se c'è ancora in config.js) oppure il Foglio database
  const configurato = () => typeof CONFIG !== 'undefined' && !!(CONFIG.fileNomiDocenti || CONFIG.fileDatabaseOrario);

  // Restituisce la mappa dei nomi, oppure lancia un errore con una spiegazione in italiano.
  // permessiInPiù: chiesti insieme a quello per Drive, per non aprire due volte la finestra di Google
  async function carica(email, permessiInPiu) {
    if (!configurato()) throw new Error('in config.js manca da dove leggere i nomi (fileDatabaseOrario)');
    if (!CONFIG.googleClientId) throw new Error('in config.js manca l\'ID client di Google');
    if (CONFIG.fileNomiDocenti) return interpreta(await scarica(await gettone([PERMESSO].concat(permessiInPiu || []), email)));
    return daDatabase(await gettone([PERMESSO, PERMESSO_FOGLI].concat(permessiInPiu || []), email));
  }

  return { carica, configurato, interpreta, bello, gettone, gettoneDisponibile, PERMESSO_DRIVE: PERMESSO };
})();

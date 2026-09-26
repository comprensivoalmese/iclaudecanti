/*
  config.js – impostazioni dell'app (l'unico file da modificare per configurarla)
*/
window.CONFIG = {
  // Indirizzo pubblico dell'app, usato per condividerla con i colleghi.
  // Se cambia, va rigenerato anche il QR code in icone/qr-app.svg (vedi LEGGIMI.md).
  indirizzoApp: 'https://comprensivoalmese.github.io/orario/app/',

  // Versione dell'app, scritta in fondo alla pagina. Quando si pubblicano modifiche importanti conviene
  // cambiarla qui E nel nome CACHE di sw.js: così tutti i dispositivi scaricano l'app da capo.
  versioneApp: '2026-09-27.2',

  // Solo gli account di questo dominio possono entrare
  dominio: 'comprensivoalmese.it',

  // Chi può MODIFICARE l'orario (Orario Facile, sostituzioni): gli altri possono solo consultarlo.
  // Un codice per persona, ricavato dalla sua email (vedi js/ruoli.js): chi non è abilitato
  // lo vede nella schermata di Orario Facile. Esempio: editori: ['3f9a0c1d2e4b5a6f', '0b1c2d3e4f5a6b7c'],
  // Lista vuota = per ora chiunque della scuola può modificare.
  // (niente nomi accanto ai codici: il repository è pubblico)
  editori: ['45aa91989fb595e7', 'aa2c03c9e7c12d25', '50a35ca7700865d9', 'a924a1ef335c2fb7', '12b16d331ac9ebc8'],

  // ID client OAuth di Google (lo crea l'amministratore Google Workspace della scuola,
  // vedi app/LEGGIMI.md). Non è un dato segreto: può stare nel repository pubblico.
  // Se si svuota ('') l'app torna in "modalità dimostrativa": chiede solo l'email, SENZA verificarla.
  googleClientId: '709643540266-2kcc07obqusacsm3qlu8trkc2gb4cjh1.apps.googleusercontent.com',

  // File riservato su Google Drive con la corrispondenza codice → nome dei docenti (Codice;Cognome;Nome).
  // Nel repository i docenti sono solo codici (DOC01, DOC02…): i nomi li vede solo chi ha accesso al file.
  // È un Foglio Google: l'ID è la parte del link tra /d/ e /edit. Non è segreto: senza il permesso su Drive
  // il file non si apre.
  fileNomiDocenti: '1NcknVOHvTXHB2ue94FjFs-iY-vT54tq3tHc7CArTEmI',

  // Foglio Google del conteggio ore ("ORE 26-27 conteggio ore"): la scheda Sostituzioni lo legge da solo e,
  // quando si assegna una sostituzione, scrive +1 nella settimana del docente che sostituisce.
  // Deve essere un vero Foglio Google (non un Excel caricato) e chi assegna deve poterlo modificare.
  fileConteggioOre: '111UrbyrZHhI7EphNQUiFlhUe0_kjS8ctu2fNTXBHeuw',

  // Foglio Google delle sostituzioni (vedi sostituzioni/js/registro-drive.js):
  // - foglio "Autorizzazioni": nomi ed email di chi può fare le sostituzioni
  // - foglio "Sostituzioni": qui l'app scrive le sostituzioni assegnate (con i nomi veri dei docenti)
  // Se si svuota (''), la scheda Sostituzioni funziona come prima (nessun controllo, niente scrittura nel foglio).
  fileSostituzioni: '1bd_d8oNdxSo8hIC26ONxN_RYUpV8dMzD2Ax78z76BJA',

  // Foglio Google «database» dell'orario (vedi orario-facile/DATABASE.md): Orario Facile lo carica e ci salva
  // con i tasti «Carica dal Foglio» / «Salva sul Foglio» (scheda Esporta). Contiene i nomi veri dei docenti:
  // deve stare sul Drive della scuola, condiviso solo con chi prepara l'orario. Vuoto = tasti non attivi.
  fileDatabaseOrario: '1gawzwbqDBwqONiZdnvbEprzYAiUOPc8IxP1fu-CrO30',

  // Dove si trova il file con l'orario (formato dell'app oppure backup di Orario Facile).
  // Con la pubblicazione su Drive (vedi sotto) serve solo come riserva, se Drive non risponde.
  urlDati: '../dati/orario.json',

  // PUBBLICAZIONE SU GOOGLE DRIVE (tasti «Pubblica orario» e «Pubblica sostituzioni» di Orario Facile,
  // vedi app/js/pubblica-drive.js). Gli ID non sono segreti: senza i permessi su Drive non servono a niente.
  // - cartellaPubblicazione: la cartella di Drive dove Orario Facile salva i file (la parte del link dopo /folders/).
  //   Dentro c'è anche la cartella «backup orario», con un backup per ogni giorno in cui si pubblica.
  cartellaPubblicazione: '1x3BIvxl3dGcqtGUTr56aCa9xhaSpbSot',
  // - cartellaOrario: se non è vuota, l'orario pubblicato e la cartella «backup orario» stanno qui invece che in
  //   cartellaPubblicazione (le sostituzioni restano in cartellaPubblicazione). Serve per tenere l'orario su un Drive
  //   personale, dove si può condividere con «Chiunque abbia il link»; chi pubblica deve esserne Editor.
  cartellaOrario: '',
  // - fileOrarioPubblicato / fileSostituzioniPubblicate: ID dei file che l'app legge. Li mostra Orario Facile
  //   dopo la prima pubblicazione. Finché sono vuoti l'app continua a leggere urlDati da GitHub.
  // Vuoto per scelta: l'app legge l'orario da GitHub (urlDati). Per tornare a leggerlo da Drive rimettere
  // l'ID del file orario-pubblicato.json sul Drive della scuola: '18OB3AMivfH-T9-tXU3v2za2Ladzd3-fo'.
  fileOrarioPubblicato: '',
  fileSostituzioniPubblicate: '1EPjN8fG3ZNjiN60ytACbtykzUxiXyEx3',
  // - googleApiKey: "chiave API" di Google (non segreta, limitata al sito github.io e alla Google Drive API).
  //   Permetterebbe anche alle LIM di leggere i due file senza accedere a Google, ma solo se sono condivisi con
  //   «Chiunque abbia il link», cosa che la nostra scuola blocca. Per questo resta vuota: l'app legge i file con
  //   il permesso Google di chi ha fatto l'accesso (basta la condivisione con l'Istituto, vedi leggiDrive in dati.js).
  googleApiKey: '',

  // Orari della campanella (tasto con la campanella). Se il file manca, si usano gli orari delle ore
  urlCampanella: '../dati/campanella.json',

  // Per quanti giorni l'accesso resta memorizzato se si spunta "Ricordami"
  giorniRicordami: 30,

  // Monitor di classe: dopo quanti minuti senza tocchi si torna alla schermata iniziale
  minutiRitornoMonitor: 2,

  // LIM delle aule (monitor): durante gli intervalli compare a tutto schermo dove vanno
  // le classi nell'ora successiva, dall'inizio alla fine dell'intervallo (vedi js/intervallo.js).
  // Se si cambiano gli inizi, aggiornare anche lo script app/lim/ che apre l'app sulle LIM Windows.
  intervalliLim: [
    { inizio: '09:55', fine: '10:05' },
    { inizio: '11:50', fine: '12:05' }
  ],

  // Schermo all'ingresso: ogni quanti secondi cambia vista (classi, docenti, aule).
  // Si può cambiare anche dal menu o con l'indirizzo .../app/?ingresso=30
  secondiRotazioneIngresso: 20,

  // Ogni quanti minuti si ricontrolla se l'orario è stato aggiornato
  // (basso, così le modifiche dell'ultimo minuto arrivano presto: il file è piccolo)
  minutiAggiornamentoDati: 5,

  // Tema "secondo l'ora": scuro da oraInizioScuro fino a oraFineScuro (ore intere, 0-23)
  oraInizioScuro: 19,
  oraFineScuro: 7
};

# CLAUDE.md – orario (IC Almese)

## Il progetto
Sito web con l'**orario scolastico di una scuola DADA** (Didattiche per Ambienti Di Apprendimento):
nelle scuole DADA le aule sono assegnate alle materie/ai docenti e sono **gli studenti a spostarsi**.
Il sito deve quindi mostrare chiaramente, per ogni ora: classe, materia, docente e **aula**.

Viene pubblicato con **GitHub Pages** direttamente da `main`, cartella radice:
https://comprensivoalmese.github.io/orario/ (pagina iniziale con i link alle due app).
Non rompere mai questi requisiti: percorsi relativi, niente build, `.nojekyll` presente,
`localStorage` sempre dentro `try/catch` (su github.io è condiviso tra tutti i repo dello stesso utente,
quindi usa chiavi con prefisso, es. `orariofacile.` e `orariodada.`).

Le parti del progetto:
- **`app/` – Luis@i** (prima si chiamava Orario DADA): app di *visualizzazione* per smartphone, tablet e monitor di classe (PWA installabile,
  accesso con Google limitato a @comprensivoalmese.it). Dettagli in `app/LEGGIMI.md`.
- **`orario-facile/` – Orario Facile**: app per *creare* l'orario. Il suo backup JSON salvato come
  `dati/orario.json` viene letto direttamente dall'app di visualizzazione: se cambi il formato del backup,
  aggiorna anche `daOrarioFacile()` in `app/js/dati.js`.
- **Integrazione**: sullo stesso dispositivo l'app legge direttamente la bozza di Orario Facile dal
  `localStorage` (chiave `orariofacile.v2`) e si aggiorna con l'evento `storage`. Non cambiare quella chiave
  senza aggiornare `CHIAVE_BOZZA` in `app/js/dati.js`. Orario Facile ha il pulsante "Vedi nell'app" e, in Esporta,
  "Scarica orario.json" (vecchio metodo: il file va caricato in `dati/`, ora serve solo da riserva).
- **Pubblicazione su Google Drive**: i tasti «📤 Pubblica orario» (scheda Orario) e «📤 Pubblica sostituzioni» (scheda
  Sostituzioni) di Orario Facile (`orario-facile/pubblica.js` + `app/js/pubblica-drive.js`) salvano nella cartella
  `CONFIG.cartellaPubblicazione` i file `orario-pubblicato.json`, `sostituzioni-pubblicate.json` e il backup del giorno
  nella cartella «backup orario». L'app li legge con `CONFIG.fileOrarioPubblicato`/`fileSostituzioniPubblicate` +
  il permesso Google di chi ha fatto l'accesso (`Dati.leggiDrive()` in dati.js, `Supplenze.scarica()`): la scuola blocca la
  condivisione «Chiunque abbia il link», quindi `CONFIG.googleApiKey` resta vuota e basta la condivisione con l'Istituto.
  Se non si può leggere Drive, legge l'ultima copia salvata o `dati/orario.json` come prima.
  Nei file pubblicati solo codici DOC01…: mai nomi veri, mai il flag «permesso» delle assenze.
  Le sostituzioni si pubblicano con `app/js/pubblica-sostituzioni.js` (`unisciEPubblica`): rilegge il file e cambia solo
  quelle di questo dispositivo (ID ricordati in `sostituzioni.pubblicateDaQui`), mai sovrascrivere il file intero;
  nell'app `avviaAutomatica()` pubblica da sola le modifiche fatte da «Sostituzioni smart». Nel file pubblicato ci sono
  `assenze`, `registro` e `cambi` (cambi d'aula, chiave locale `sostituzioni.cambiAula`, senza il motivo); l'app li unisce
  ai dati locali in `Supplenze.settimana()` (`cambioAula()` per la tabella, `avviso-per-te.js` per il riquadro).
- **Foglio database** (su Drive si chiama «Database» dal 27/09/2026; `orario-facile/database.js`, formato in `orario-facile/DATABASE.md`): l'archivio unico dell'orario è
  un Foglio Google (`CONFIG.fileDatabaseOrario`) che Orario Facile carica e su cui salva (scheda Esporta). Legge/scrive
  solo le colonne «dati» in posizioni fisse (le formule e i colori li crea una volta `strumenti/crea-database.ps1`);
  la griglia «Orario» è docente × ora con la scrittura breve `1A`, `1A STO`, `1A ITA @MENSA`, `+2B SOS`, `… *`.
  Se cambi il formato, aggiorna insieme database.js, DATABASE.md e lo script. I nomi veri del Foglio restano solo in memoria.
- **Compresenze** (`app/js/compresenze.js`): ore in cui un secondo docente è in classe con il titolare (potenziamento L2,
  tempo prolungato, Alternativa in parallelo a Religione, sostegno…). Arrivano dal Foglio Google «Compresenze»
  (`CONFIG.fileCompresenze`, primo foglio: Codice docente, Classe, Giorno, Ora, Tipo; ogni ora deve avere un docente, le righe
  incomplete si ignorano) e dalle celle «+» di Orario Facile (`v.co`, `compresenzeOF` in dati.js). L'app le aggiunge a
  `D.lezioni` (con `compresenza: true`) solo se è spuntato il quadratino «Compresenze»; le curricolari restano in
  `D.lezioniCurricolari` (le usa modifiche.js). Sul dispositivo si salva solo una copia con i codici.
  La gestione è STRUTTURALE e sta in Orario Facile (l'app serve al quotidiano): scheda «8 Compresenze»
  (`orario-facile/scheda-compresenze.js` e `.css`, indirizzo `#compresenze`; nell'app solo il collegamento «✎ Modifica» per i
  modificatori). È la maschera d'inserimento: legge e riscrive con la Sheets API il primo foglio del Foglio Compresenze
  e la scheda «Gruppi» (gruppi, ore previste e docenti previsti di QUESTA scuola: cambiano da scuola a scuola, quindi
  stanno su Drive e non nel codice; `CONFIG.gruppiCompresenze` contiene solo i gruppi proposti, senza numeri né codici).
  Un gruppo con «nelle ore di» una materia (Alternativa → Religione) conta da solo le ore previste nell'orario.
  **Sostegno** (dato sanitario, GDPR): griglia «Sostegno» (un docente per riga, giorni × ore, in ogni cella la classe) e scheda
  «Sostegno classi» (spunta e ore previste) nel Foglio Compresenze o in `CONFIG.fileSostegno`; nell'app solo per docenti e
  modificatori, solo in memoria; «Scarica orario.json» di Orario Facile toglie le compresenze «SOS…». Mai su GitHub.
- **Piantine** (`app/js/piantine.js`, `app/css/piantine.css`, editor `orario-facile/scheda-piantine.js` nella scheda 3 Aule):
  un'immagine per piano su Drive (`CONFIG.piantine`: piano = lettera/cifra iniziale dei codici delle aule, nome, file = ID),
  MAI su GitHub (tavole tecniche); la posizione di ogni aula (Piano, X %, Y %) nelle colonne D-F della scheda «Aule» del
  Foglio Database. Nell'app un'aula segnata diventa un tasto (`data-piantina`) che apre «📍 Dov'è».
  Le immagini possono essere PNG/JPG (segnaposto sul punto) o, meglio, SVG semplificati a rettangoli: `<rect class="stanza"
  data-nome data-cx data-cy>` (centro in %) si toccano (in Orario Facile l'aula va al centro della stanza; nell'app la stanza
  dell'aula è gialla e le altre aule del piano si toccano), `class="servizio"` = scale, bagni… non si toccano. L'SVG viene
  ripulito (`svgPulito`: niente script né attributi on…) prima di entrare nella pagina.
- **Dati della scuola in Orario Facile**: `orario-facile/index.html` contiene i dati 2026/27
  (`CSV_SCUOLA_CLASSI`, `CSV_SCUOLA_DOCENTI` e `datiScuola()`), caricati alla prima apertura e con il pulsante
  "Dati scuola 2026/27". **Privacy**: il repo è pubblico, quindi i docenti compaiono solo con un codice
  (DOC01, DOC02…, assegnati in ordine casuale: niente iniziali, niente ordine alfabetico). La corrispondenza codice → nome
  sta nella scheda Docenti del Foglio database (colonne Cognome e Nome), sul Drive della scuola, visibile a tutti gli
  account dell'Istituto (docenti **e studenti**: scelta della scuola, 27/09/2026) ma mai su GitHub; non pubblicare mai
  nel repo nomi completi, iniziali, PDF o fogli con i nomi dei docenti.
  Per vedere i nomi: `app/js/nomi.js` (`NomiDocenti.carica(email)`) legge con il permesso dell'utente la scheda Docenti
  di `CONFIG.fileDatabaseOrario` (oppure il vecchio file `CONFIG.fileNomiDocenti`, se è ancora indicato) e restituisce
  una Map codice → {cognome, nome}; i nomi stanno
  solo in memoria (in Orario Facile: pulsante «👁 Nomi», `NOMI`, `nomeDoc()`; nell'app: pulsante «👁 Nomi» nella barra (da 960 px in su) e voce nel menu utente,
  `applicaNomi()` in app.js, che cambia solo `D.docente[].nome` e tiene il codice in `.codice`), mai in localStorage, backup o CSV.
- **Autorizzazioni** (dal 27/09/2026, `app/js/autorizzazioni.js`): file a parte «Autorizzazioni» (`CONFIG.fileAutorizzazioni`,
  prima scheda), condiviso in lettura SOLO con gli autorizzati: chi non può aprirlo non ha autorizzazioni. Colonne: Nome, Cognome, Email, **Orario Facile** (SI/NO), **Sostituzioni** (SI/NO).
  Orario Facile: la porta (`porta.js`) fa entrare solo chi ha SI in «Orario Facile» (esito ricordato fino a sera sul dispositivo);
  sostituzioni: `RegistroDrive.abilitazione` usa la colonna «Sostituzioni»; app: le voci di Gestione si vedono solo con
  l'autorizzazione giusta (`controllaAutorizzazioni` in app.js). Finché la scheda non c'è valgono le regole di prima (qui sotto).
  Si crea con «Crea la scheda Autorizzazioni» (Orario Facile → Esporta), che ci sposta l'elenco del file delle sostituzioni.
- **Ruoli** (regole di prima, ancora usate finché manca la scheda Autorizzazioni): *modificatori* (possono usare Orario Facile) e *fruitori* (solo l'app). `app/js/ruoli.js` +
  `CONFIG.editori` in `app/js/config.js` (codici SHA-256 di 16 caratteri, **mai email in chiaro**: repo pubblico;
  lista vuota = tutti modificatori). Orario Facile è protetto da `orario-facile/porta.js`/`porta.css`, che riusano
  `app/js/accesso.js` (stessa sessione `orariodada.sessione`). È un controllo lato browser: la vera protezione
  dell'orario pubblicato sono i permessi del repo GitHub.
- **Sostituzioni docenti**: è la scheda 9 di Orario Facile (`#p-sostituzioni`, `renderSostituzioni()`), ma il suo codice
  sta in file separati in `sostituzioni/` (css/, js/) per non gonfiare `orario-facile/index.html` e ridurre i conflitti.
  Orario Facile li carica con `<script src="../sostituzioni/js/...">` insieme a `../app/js/dati.js` e chiama
  `Sostituzioni.monta(contenitore, () => Dati.normalizza(S))`: se cambi il formato di `S` o l'interfaccia di `Dati`,
  controlla anche la scheda. Id HTML con prefisso `sost-`, classi CSS `.sost`/`sost-` (Orario Facile ha già un `#fileFoglio`).
  Legge il foglio del conteggio ore (.ods/.xlsx/.csv) **solo nel browser** e salva in `localStorage` con chiavi
  `sostituzioni.`; nel repo solo facsimili con nomi inventati in `sostituzioni/esempio/`. `sostituzioni/index.html`
  rimanda a `orario-facile/#sostituzioni`. Dettagli in `sostituzioni/LEGGIMI.md`.
  Copie di file riservati vanno in `privato/` (esclusa da git).
  Anche l'app legge `sostituzioni.assenze` e `sostituzioni.registro` (`app/js/supplenze.js`) per evidenziare nella tabella
  le sostituzioni della settimana: se cambi il formato di assenze o registro, aggiorna anche quel file.
  Il foglio del conteggio può stare su Google Drive (`CONFIG.fileConteggioOre`): `sostituzioni/js/drive.js` lo legge e
  scrive +1/-1 nella settimana del sostituto quando si assegna o si annulla una sostituzione (`segnaNelFoglio()`).
  **Annullare dalla tabella**: chi è autorizzato alle sostituzioni vede «✕ Annulla» sulle sostituzioni della tabella
  (`app/js/viste.js`, `stato.puoAnnullare`); si apre la pagina smart che chiede conferma e chiama `annullaVoce()` del motore:
  −1 nel foglio del conteggio e riga tolta dal foglio «Sostituzioni», anche per le sostituzioni registrate su un ALTRO dispositivo.
  Quelle vanno nell'elenco `annullate` (chiave `sostituzioni.annullate` e campo `annullate` del file pubblicato):
  `supplenze.js` le nasconde e `PubblicaSostituzioni.applicaAnnullate()` le toglie dal registro del dispositivo che le aveva
  registrate (senza un secondo −1). Il file pubblicato ora ha anche `nelFoglio`/`nelRegistro`/`riportata` per ogni sostituzione.
  **Chi può fare le sostituzioni** lo decide il Foglio Google `CONFIG.fileSostituzioni` (`sostituzioni/js/registro-drive.js`):
  foglio «Autorizzazioni» (nomi ed email degli autorizzati) e foglio «Sostituzioni» (una riga per sostituzione assegnata,
  con i **nomi veri** dei docenti presi da `fileNomiDocenti` e tenuti solo in memoria). Su GitHub e in `localStorage`
  restano **solo i codici DOC01…**: i nomi veri stanno solo nei file su Drive.
  **Sostituzioni smart** (`app/js/smart.js`, menu dell'app): versione semplice della scheda che usa lo stesso motore con
  `Sostituzioni.collega(funzioneOrario, { avvisa, ridisegna })` (restituisce le funzioni del motore). Se cambi il motore,
  controlla sia la scheda (`monta`) sia la pagina smart (`collega`); la costante `VERSIONE` in cima a sostituzioni.js
  si vede nella scheda e serve a capire se una pagina aperta è aggiornata.

## Licenza
© 2026 Istituto Comprensivo di Almese (www.comprensivoalmese.it), realizzato dal Gruppo Wolf: **tutti i diritti
riservati**, permessi d'uso solo scritti e decisi dalla scuola (`LICENZA.md` in italiano, `LICENSE` per GitHub). Non togliere gli avvisi nel piè di pagina (pagina iniziale, app in
`$('#piede')` di app.js, Orario Facile) né i commenti in cima alle pagine HTML. I dati della scuola (`dati/`, nomi)
non si concedono mai a terzi. Se si aggiunge codice di altri, controllare che la sua licenza lo permetta e citarlo.

## Il gruppo
- Gruppo **Wolf**; repository `comprensivoalmese/orario` (organizzazione GitHub della scuola; prima era
  `alessandrotrino-creator/iclaudecanti`), studenti **principianti** in programmazione e git.
- Tutti lavorano su tutto, direttamente su `main`.
- **Parla sempre in italiano**: risposte, commenti nel codice, messaggi di commit, documentazione.
- Spiega passo passo e con parole semplici cosa stai facendo e perché; niente gergo senza spiegarlo.

## Tecnologie
- **Solo HTML, CSS e JavaScript puri.** Niente framework, niente Node.js, niente passaggi di build:
  il sito deve funzionare aprendo `index.html` nel browser e su GitHub Pages così com'è.
- Nessuna libreria esterna salvo necessità reale; in quel caso chiedi prima al gruppo.

## Struttura
```
index.html        pagina iniziale del sito (link alle due app)
404.html          pagina per indirizzi inesistenti su GitHub Pages
.nojekyll         dice a GitHub Pages di pubblicare i file così come sono
app/              Luis@i, app di visualizzazione (css/, js/, icone/, sw.js, manifest; lim/ = script per le LIM Windows)
orario-facile/    l'app Orario Facile (un unico index.html autonomo + modelli CSV)
sostituzioni/     codice della scheda Sostituzioni di Orario Facile (css/, js/, esempio/ con facsimili)
potenziamento/    linee guida per assegnare le ore di potenziamento di italiano L2 (linee-guida-L2.md):
                  da seguire quando si costruisce in Orario Facile l'orario dei docenti di potenziamento;
                  le ore di potenziamento stanno nel Foglio Compresenze (gruppo «Potenziamento L2», scheda 8 di
                  Orario Facile); il vecchio Foglio «Orario potenziamento» è archiviato (27/09/2026)
strumenti/        script da usare sul PC (Windows + Excel), es. crea-database.ps1 per creare il Foglio database
dati/orario.json  l'orario letto da app/ (formato dell'app o backup di Orario Facile)
dati/campanella.json  orari della campanella per il tasto 🔔 dell'app (vedi app/js/campanella.js)
img/              immagini
```
- Tieni i **dati dell'orario separati dal codice** (file JSON in `dati/`), così si possono aggiornare senza toccare JS/HTML.
- Preferisci più file piccoli a un unico file enorme: riduce i conflitti tra chi lavora in parallelo.
- Con GitHub Pages usa **percorsi relativi** (`css/base.css`, non `/css/base.css`).
- `app/js/config.js` è l'unico file di configurazione dell'app (dominio, ID client Google, tempi).
- Nota: `fetch()` dei JSON non funziona aprendo il file con doppio clic (`file://`); per provare in locale
  usa un server semplice (es. estensione Live Server o `python -m http.server`).

## Regole di codice (richieste dall'insegnante)
1. **Codice commentato**: commenti in italiano che spiegano *cosa* fa ogni blocco, pensati per principianti.
2. **Accessibilità**: HTML semantico (`header`, `nav`, `main`, `table` con `th`/`scope`, `caption`),
   `alt` su tutte le immagini, contrasto adeguato, uso completo da tastiera, `lang="it"`.
3. **Responsive**: deve funzionare bene su telefono (approccio mobile-first, `meta viewport`,
   tabelle dell'orario leggibili su schermi stretti).
- **Nomi in italiano** per classi CSS, id, variabili e funzioni, in minuscolo con trattini per il CSS
  (`.menu-principale`) e camelCase per JS (`mostraOrario`). Niente accenti nei nomi.
- Indentazione di 2 spazi.

## Git: come lavora Claude
Claude gestisce le versioni in autonomia:
1. **Prima di modificare qualsiasi cosa**: `git pull --rebase`.
2. Commit **piccoli e frequenti**, un argomento per commit, messaggio in italiano chiaro
   (es. "Aggiunge filtro per aula nell'orario").
3. Appena una modifica è completa: commit e **push su `main` senza chiedere** (si può usare `./sync.sh "messaggio"`).
4. Se il push viene rifiutato perché qualcuno ha pubblicato prima: `git pull --rebase` e riprova.
5. **Conflitti**: risolvili tu mantenendo le modifiche di entrambi quando possibile, poi spiega al gruppo
   in modo semplice cosa è stato unito e come. Se due modifiche sono davvero incompatibili, chiedi.
6. Mai `git push --force`, mai riscrivere la cronologia già pubblicata, mai commit di merge (usa sempre il rebase).

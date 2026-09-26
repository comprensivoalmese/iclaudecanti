# orario

Repo collaborativo del **Gruppo Wolf** nell'organizzazione GitHub della scuola **comprensivoalmese**
(fino al 26/09/2026 era `alessandrotrino-creator/iclaudecanti`).

© 2026 Istituto Comprensivo di Almese ([www.comprensivoalmese.it](https://www.comprensivoalmese.it)) – realizzato dal Gruppo Wolf.
**Tutti i diritti riservati**: il codice, anche in parte, si può usare solo con il permesso scritto della scuola,
che decide caso per caso se concederlo e a quali condizioni. Dettagli in [LICENZA.md](LICENZA.md).

## Ultimi aggiornamenti

**26/09/2026 – Sostituzioni pubblicate da sole (anche da «Sostituzioni smart»)**

- chi assegna o annulla una sostituzione dall'app (Sostituzioni smart) non deve più premere niente: dopo pochi secondi
  l'app la **pubblica da sola** e tutti la vedono (e il docente interessato riceve il riquadro «per te»);
- se il permesso di Google non c'è ancora, in basso compare «Ci sono sostituzioni nuove da pubblicare · Pubblica ora»;
- la pubblicazione **unisce** invece di sostituire: rilegge il file su Drive e cambia solo le sostituzioni di quel
  dispositivo, così il telefono e il computer di Orario Facile non si cancellano il lavoro a vicenda. Se Drive non
  risponde non pubblica. Lo fa anche il tasto «Pubblica sostituzioni» di Orario Facile (`app/js/pubblica-sostituzioni.js`).

**26/09/2026 – Avviso «per te» che scende dall'alto**

- quando un docente apre l'app (o mentre ce l'ha aperta), un riquadro arancione scende dall'alto con le **sue**
  sostituzioni da oggi in poi: «Sostituisci in 2B · Domani, 3ª ora · aula …» e «La tua lezione in 1A è coperta da …»;
- «Vedi il mio orario» apre la sua giornata, «Ho visto» lo chiude e non ricompare per quelle lezioni;
- se ha permesso le notifiche e l'app è in secondo piano arriva anche la notifica del telefono;
- usa le sostituzioni pubblicate con «Pubblica sostituzioni»; non compare sui monitor e sullo schermo all'ingresso
  (codice in `app/js/avviso-per-te.js` e `app/css/avviso-per-te.css`).

**26/09/2026 – Il Foglio database dell'orario**

- l'orario sta in **un solo file**, un Foglio Google sul Drive della scuola: Orario Facile lo carica e ci salva
  (scheda Esporta → «📥 Carica dal Foglio» / «📤 Salva sul Foglio»); si può modificare anche a mano, con i colori che
  segnalano doppioni e ore fuori cattedra;
- la griglia ha una riga per docente e una colonna per ora: `1A`, `1A STO`, `1A ITA @MENSA`, `+2B SOS` (compresenza);
- formato in [orario-facile/DATABASE.md](orario-facile/DATABASE.md); il Foglio si crea con `strumenti/crea-database.ps1`;
  dal file Excel storico si passa con «Importa orario compilato» e poi «Salva sul Foglio»;
- per attivarlo va scritto l'ID del Foglio in `app/js/config.js` (voce `fileDatabaseOrario`).

**26/09/2026 – Copyright e condizioni d'uso**

- nuovo file [LICENZA.md](LICENZA.md) (e `LICENSE`, letto da GitHub): **tutti i diritti riservati** all'Istituto
  Comprensivo di Almese; chi vuole usare il codice deve chiedere il permesso alla scuola, che decide se concederlo,
  a quali condizioni e con quale eventuale compenso (per poche ore il 26/09 era stata usata la licenza CC BY 4.0);
- l'avviso compare anche in fondo alla pagina iniziale, all'app Luis@i e a Orario Facile.

**26/09/2026 – Sostituzioni ben visibili nella tabella e assenze per tutta la settimana** (Chiara)

- nella **tabella dell'orario** le sostituzioni della settimana si vedono subito: **cornice arancione** con
  l'etichetta *🔄 Sostituzione*, il docente assente barrato e il nome di chi sostituisce; **cornice rossa
  tratteggiata** se il sostituto manca ancora. Nell'orario del docente che sostituisce compare l'ora in più;
- nella scheda Sostituzioni e in «Sostituzioni smart» un'assenza si può registrare **per più giorni della stessa
  settimana** in un colpo solo, e i **pulsanti dei giorni** mostrano quante ore restano da coprire in ogni giorno;
- per ora le sostituzioni nella tabella si vedono sul dispositivo dove sono state registrate;
- dettagli in [app/LEGGIMI.md](app/LEGGIMI.md#sostituzioni-nella-tabella) e [sostituzioni/LEGGIMI.md](sostituzioni/LEGGIMI.md).

**25/09/2026 – Icona nuova: il robottino a pixel** (Chiara)

- la mascotte è stata ridisegnata a **quadrettoni**, nello stile di Claude Code ma tutta nostra: un robottino bianco
  che sembra un animaletto, con **due antenne** a pallina gialla, occhi a stanghetta, braccine, piedi gialli e un
  **orologio giallo sulla pancia**, sempre su sfondo blu;
- cambiano tutte le icone (scheda del browser, schermata di accesso, app installata su Android e iPhone) e anche il
  robot che dondola durante il caricamento;
- dettagli in [app/LEGGIMI.md](app/LEGGIMI.md#icona-e-caricamento-il-robottino-a-pixel).

**25/09/2026 – Manuali per fruitori e modificatori** (Alessandro)

- due guide, in breve e dettagliate: una per chi consulta l'orario ([manuali/orario-dada-fruitori.md](manuali/orario-dada-fruitori.md)) e una per chi lo modifica e fa le sostituzioni ([manuali/orario-facile-modificatori.md](manuali/orario-facile-modificatori.md));
- per ora sono solo file da sfogliare nel repository: non sono collegati all'app né a Orario Facile.

**25/09/2026 – Nuova icona e caricamento con il robot** (Chiara)

- l'app ha una mascotte: un **robot sorridente** con l'orologio sul petto; è la nuova **icona** (anche nella schermata di accesso);
- quando si apre l'app, mentre si carica, il robot **dondola** su sfondo blu, sbatte le palpebre, l'antenna lampeggia e la lancetta gira;
- dettagli in [app/LEGGIMI.md](app/LEGGIMI.md#icona-e-caricamento-il-robottino-a-pixel).

**25/09/2026 – Linee guida per le ore di potenziamento di italiano L2** (Margherita)

- nuova cartella `potenziamento/` con le [linee guida per l'assegnazione delle ore di potenziamento di italiano L2](potenziamento/linee-guida-L2.md)
  (scuola secondaria di I grado), da portare all'approvazione del Collegio dei docenti;
- dicono come si calcolano le ore di ogni alunno (griglia a punteggio su 20, da 2 a 6 ore, 18 ore in tutto),
  come si abbinano alunni e docenti e in quali discipline collocare le ore: sono la guida da seguire ogni anno
  per costruire l'orario dei docenti di potenziamento in Orario Facile;
- valgono per tutti gli anni scolastici; alunni e docenti compaiono solo con codici (AL1…, DOC1…).

**25/09/2026 – Modifiche all'orario in stile storie** (Chiara)

- le modifiche dell'ultimo minuto ora si vedono **come le storie di Instagram**: cerchi colorati in alto (grigi quando già visti),
  e toccandone uno la modifica si apre a tutto schermo, con barrette, passaggio automatico, pausa e chiusura;
  toccando la notifica del telefono si aprono direttamente le storie;
- corretto un difetto dell'app sui telefoni: la pagina risultava più larga dello schermo e si rimpiccioliva
  (colpa di testi nascosti per i lettori di schermo che "uscivano" dalla tabella).

**25/09/2026 – Modifiche dell'ultimo minuto e campanella degli intervalli** (Chiara)

- **Modifiche dell'ultimo minuto**: se l'orario pubblicato cambia, l'app lo mostra in un riquadro giallo in alto
  ("⚠️ Modifiche all'orario di oggi": com'era prima e com'è adesso) e segna le lezioni cambiate nella tabella;
  il docente coinvolto vede "ti riguarda", il monitor di un'aula solo le modifiche di quell'aula. L'app ricontrolla
  l'orario ogni 5 minuti e, se si vuole, manda anche una notifica. Dettagli in [app/LEGGIMI.md](app/LEGGIMI.md#modifiche-dellultimo-minuto);
- **Campanella** (`dati/campanella.json`): ora suona all'inizio degli intervalli (9:55, 11:50) e alla loro fine
  (10:05, 12:05), che è anche l'inizio della 3ª e della 5ª ora (prima suonava alle 10:00 e alle 12:00).

**25/09/2026 – LIM: dove andare dopo l'intervallo** (Chiara)

- sulle LIM (monitor dell'aula), durante gli intervalli (**9:55–10:05 e 11:50–12:05**) l'app mostra a tutto schermo dove va ogni classe
  nell'ora successiva (aula, materia, docente) e chi arriva in quell'aula;
- una pagina web non può aprirsi da sola quando è chiusa: sulle **LIM Windows** ci pensa lo script
  `app/lim/installa-apertura-intervallo.bat` (doppio clic, si scrive il nome dell'aula), che programma l'apertura
  dell'app agli intervalli; finito l'intervallo (10:05, 12:05) la finestra si chiude da sola. Per le LIM Android ci sono le istruzioni;
- dettagli in [app/LEGGIMI.md](app/LEGGIMI.md#lim-dove-andare-dopo-lintervallo).

**25/09/2026 – Modificatori e fruitori** (Chiara)

Non tutti possono modificare l'orario: ora ci sono due ruoli.

- **Fruitori** (tutti gli account della scuola): consultano l'orario nell'app Luis@i;
- **Modificatori**: possono usare Orario Facile (orario e sostituzioni). Chi apre Orario Facile deve accedere con
  l'account della scuola; se non è abilitato vede "Solo consultazione" e il suo codice da mandare a chi gestisce l'app;
- l'elenco è in `app/js/config.js` (`editori`), con **codici** al posto delle email (il repo è pubblico);
  finché è vuoto, possono modificare tutti. Istruzioni in [app/LEGGIMI.md](app/LEGGIMI.md#chi-può-modificare-lorario).

**25/09/2026 – Schermo all'ingresso con le viste a rotazione** (Chiara)

Nuova modalità dell'app Luis@i per il televisore o il proiettore all'ingresso:
[.../app/?ingresso](https://comprensivoalmese.github.io/orario/app/?ingresso) (o dal menu: "Uso di questo dispositivo").

- l'orario di oggi cambia vista da solo: **Classi → Docenti → Aule**;
- **ogni quanti secondi lo decide l'utente**: nel menu si scrive il numero (da 5 a 600) o lo si regola con − e +; anche dall'indirizzo, es. `?ingresso=30`;
- se le colonne non stanno nello schermo, vengono divise in pagine che ruotano anch'esse: niente da scorrere;
- un tocco mette in pausa la rotazione, che riparte da sola dopo 2 minuti senza tocchi;
- istruzioni in [app/LEGGIMI.md](app/LEGGIMI.md#schermo-allingresso-proiezione-a-rotazione).

**25/09/2026 – Sostituzioni docenti dentro Orario Facile** (Chiara)

Le sostituzioni sono ora la **scheda 9 «Sostituzioni»** di
[Orario Facile](https://comprensivoalmese.github.io/orario/orario-facile/#sostituzioni)
([istruzioni](sostituzioni/LEGGIMI.md)); il vecchio indirizzo `sostituzioni/` porta lì.

- usa direttamente l'**orario di Orario Facile**: se lo modifichi, le proposte si aggiornano;
- si carica il **foglio del conteggio ore** (.ods, .xlsx o .csv): viene letto solo sul computer, **non viene pubblicato**;
- si segna il docente assente e, per ogni ora, la scheda propone i docenti liberi **a partire da chi ha più ore a debito**;
- tiene il conto delle ore di sostituzione da riportare nel foglio, stampa le sostituzioni del giorno ed esporta in CSV;
- il codice resta nella cartella `sostituzioni/` (in `orario-facile/index.html` ci sono solo poche righe di collegamento),
  così chi lavora sull'orario e chi lavora sulle sostituzioni non si pesta i piedi;
- per provarla: facsimili con nomi inventati in `sostituzioni/esempio/`.

**24/09/2026 – Aule e orario completo in Orario Facile** (Alessandro)

- caricato il backup 2026/27 aggiornato (cattedre di Mensa e Laboratorio comprese);
- create le **21 aule** dal documento "Occupazione aule", con nome = numero aula + prime tre lettere del nome + numero
  (es. `110ITA4`, `S19MUS1`, `C1PAL`), più l'aula **MENSA**; ogni docente ha le sue aule, e chi ha ore di Mensa anche MENSA;
- palestra e mensa possono ospitare più classi insieme, le altre aule una classe per volta;
- chi apre Orario Facile trova già l'**orario definitivo 2026/27** (importato dal foglio «Definitivo PUBBLICATO»):
  468 ore, nessun conflitto; chi aveva già aperto il programma preme «Dati scuola 2026/27» per caricarlo;
- il docente di Arte di 1C, 2C, 3C, 1D, 2D, 3D è DOC44;

Da completare: in 1C e 2C le cattedre di Laboratorio sommano 5 ore contro le 3 del quadro orario.

**24/09/2026 – Orario Facile già compilato con i dati 2026/27** (Alessandro)

Aprendo [Orario Facile](https://comprensivoalmese.github.io/orario/orario-facile/)
si trova già la nostra scuola, ricavata dall'elenco "Docenti con materie e classi" 2026/27:

- 15 classi (1A–3E) e 43 docenti con 174 cattedre;
- i docenti sono **anonimi: DOC01, DOC02…** (codici in ordine casuale): il repository è pubblico, quindi
  nomi e iniziali non vanno messi qui; la corrispondenza con i nomi è in un file riservato su Google Drive;
- orario dal lunedì al venerdì, 6 ore al mattino; 1C, 2C e 3C anche martedì, mercoledì e giovedì pomeriggio (2 ore);
- Approfondimento a 0 ore; nuove discipline **Mensa** e **Laboratorio** (per ora a 0 ore);
- nuovo pulsante in alto **"Dati scuola 2026/27"**: chi aveva già aperto Orario Facile vede ancora i suoi dati salvati
  e con questo pulsante carica quelli nuovi;
- nella griglia dell'orario si vede il codice del docente (DOC01, DOC02…).

Da completare: ore e docenti di Mensa e Laboratorio per le classi C; Arte in 1C, 2C, 3C, 1D, 2D, 3D non ha ancora un docente.

## Come lavoriamo (tutti su `main`)

Per evitare conflitti:

1. **Prima di iniziare**: `git pull --rebase`
2. **Commit piccoli e frequenti**, ognuno su un argomento.
3. **Per consegnare**: `./sync.sh "cosa ho fatto"` (fa commit, pull --rebase e push).
4. **Commit piccoli e file piccoli**: meno righe tocchi, meno conflitti.

Configurazione consigliata (una volta sola):

```bash
git config pull.rebase true
git config rebase.autoStash true
```

## Il sito

Orario scolastico di una scuola DADA, in HTML/CSS/JS puro.

**Sito online:** https://comprensivoalmese.github.io/orario/
Regole e convenzioni complete in [CLAUDE.md](CLAUDE.md).

## Struttura

- `index.html` – pagina iniziale
- `app/` – **Luis@i**, per vedere l'orario da telefono, tablet e monitor di classe ([istruzioni](app/LEGGIMI.md))
- `orario-facile/` – l'app Orario Facile, per creare l'orario
- `sostituzioni/` – codice della scheda **Sostituzioni** di Orario Facile ([istruzioni](sostituzioni/LEGGIMI.md))
- `potenziamento/` – [linee guida per le ore di potenziamento di italiano L2](potenziamento/linee-guida-L2.md), da seguire per l'orario dei docenti di potenziamento
- `dati/orario.json` – l'orario mostrato dall'app
- `img/` – immagini

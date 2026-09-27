# Il Foglio database dell'orario

L'orario sta in **un solo file**: un Foglio Google sul Drive della scuola, che si chiama **«Database»**
(prima «Orario database»: il nome si può cambiare, l'app lo trova dall'ID).
**Orario Facile** lo carica e ci salva (scheda **Esporta** → «📥 Carica dal Foglio» / «📤 Salva sul Foglio»),
e chi prepara l'orario a mano può lavorarci direttamente: la griglia ha i colori che segnalano gli errori.

- Codice: [`database.js`](database.js). ID del Foglio in [`../app/js/config.js`](../app/js/config.js), voce `fileDatabaseOrario`.
- Il Foglio contiene i **nomi veri** dei docenti (scheda Docenti, Cognome e Nome) ed è anche la fonte da cui l'app
  li mostra a docenti e studenti: sta **solo** sul Drive della scuola, condiviso **in lettura con tutto l'Istituto** e
  in modifica («Editor») solo con chi prepara l'orario. Nel repository (pubblico) e nei dati di Orario Facile i docenti
  restano solo codici (DOC01…): i nomi letti dal Foglio restano solo in memoria.
- Il Foglio creato prima del 27/09/2026 aveva in Docenti B «Nome (vero)» e C «Aule»: Orario Facile lo legge ancora,
  ma va sostituito con quello nuovo (vedi sotto «Passare al formato nuovo»).
- Il Foglio vuoto (con formule, colori e controlli) si crea con [`../strumenti/crea-database.ps1`](../strumenti/crea-database.ps1)
  partendo da un backup di Orario Facile. Si fa **una volta sola**: poi basta «Salva sul Foglio».

## Colori

- **giallo** = dati: si scrivono a mano oppure li scrive Orario Facile;
- **grigio** = calcolato (formule): non scriverci, Orario Facile non lo tocca;
- nella griglia **Orario**: **rosso** = la classe ha già un altro docente in quell'ora; **arancione** = il docente non ha
  cattedre in quella classe; **azzurro** = compresenza.

## Le schede

Orario Facile legge e scrive **solo le colonne indicate**, nelle posizioni indicate. Non spostare colonne e non
rinominare le schede (si possono aggiungere righe nelle zone gialle).

| Scheda | Righe | Colonne dati | Calcolate |
|---|---|---|---|
| **Impostazioni** | voce per voce | A voce · B valore: Scuola, Anno scolastico, Durata ora (minuti), Inizio lezioni, Ore del mattino, Ore del pomeriggio, Giorni (separati da virgola), Versione dati | – |
| **Vincoli** | 2–41 | A nome del vincolo (come in Orario Facile, es. `maxConsec`) · B valore (numero oppure SI/NO) · C spiegazione | – |
| **Discipline** | 2–41 | A sigla · B nome · C ore standard · D principale · E blocchi di 2 ore · F modo blocchi · G può stare all'ultima ora · H colore (0-360) | – |
| **Aule** | 2–81 | A aula · B tipo · C più classi insieme (SI/NO) | – |
| **Classi** | riga 1 intestazione, 2–41 classi | A classe · B anno · C..N ore attive «‹giorno› mattino» / «‹giorno› pomeriggio» (l'intestazione dice quale giorno) | P ore settimanali |
| **Quadro** | riga 1 sigle, 2–41 classi | A classe · B..AN ore settimanali di ogni materia (la riga 1 dice quale) | AP totale |
| **Docenti** | 2–121 | A codice (DOC01…) · B cognome · C nome · D aule (separate da virgola, la prima è la principale) · E giorno libero · F max ore al giorno · G max ore consecutive · H indisponibilità | J–L ore nelle cattedre, ore nell'orario, esito |
| **Cattedre** | 2–401 | A codice docente · C classe · D sigla della materia · E ore | B nome · G–I controlli |
| **Orario** | righe 1-2 giorni e ore, 3–122 docenti | A codice docente · C..BJ una colonna per ogni ora della settimana (giorno per giorno: mattino poi pomeriggio) | B nome · BL–BN ore messe, ore nelle cattedre, esito |
| **Vista classi** | – | – | l'orario di ogni classe, ricavato dalla griglia |
| **Controlli** | – | – | per ogni classe: ore attive, quadro, lezioni, doppioni; riepilogo |

Indisponibilità (Docenti, colonna G): `Lunedì 1,2; Venerdì 6,p1` = lunedì 1ª e 2ª ora, venerdì 6ª ora e 1ª del pomeriggio.

## Come si scrive una cella della griglia «Orario»

Una riga per docente, una colonna per ora. In ogni cella:

| Scrittura | Significato |
|---|---|
| `1A` | classe 1A, con l'unica materia che il docente ha in quella classe, nella sua aula principale |
| `1A STO` | classe 1A, materia STO: serve quando il docente ha **più materie** in quella classe |
| `1A ITA @MENSA` | come sopra, ma in un'aula diversa da quella principale del docente |
| `+2B SOS` | **compresenza**: il docente è in 2B insieme al titolare di quell'ora (la parola dopo la classe è l'attività, facoltativa) |
| `1A MAT *` | lezione **bloccata**: il generatore automatico di Orario Facile non la sposta |

Orario Facile, quando salva, usa sempre la scrittura più corta possibile. Quando carica, se una cella non si capisce
(classe o materia sconosciuta, doppione, docente senza cattedra in quella classe e senza sigla) lo elenca prima di
chiedere conferma. Un'aula lasciata vuota in Orario Facile diventa l'aula principale del docente.

## Passare dal file Excel storico al Foglio (una volta sola)

1. In Orario Facile, scheda **Orario** → «Importa orario compilato» → scegliere il file Excel (una riga per docente e una
   colonna per ogni ora): il programma abbina i nomi ai codici e ricava le materie dalle cattedre.
2. Controllare l'orario, poi **Esporta** → «📤 Salva sul Foglio».

## Passare al formato nuovo (una volta sola, 27/09/2026)

1. Orario Facile → Esporta → «📥 Carica dal Foglio» (legge il Foglio vecchio: così non si perde nessuna modifica).
2. «👁 Nomi» (legge i nomi dal vecchio file dei nomi, ancora indicato in config.js).
3. Nel Foglio: File → Importa → il nuovo `Database.xlsx` (creato da `strumenti/crea-database.ps1`) → «Sostituisci foglio di lavoro».
4. Orario Facile → «📤 Salva sul Foglio» (avvisa che il Foglio è cambiato: «Salva comunque»). Cognome e Nome si riempiono.
5. In config.js si svuota `fileNomiDocenti`: da quel momento l'app legge i nomi dal Foglio database.

## Salvataggi da più computer

Prima di salvare Orario Facile rilegge il Foglio: se è cambiato dopo l'ultimo «Carica» o «Salva» fatto da quel computer
(per esempio qualcuno l'ha modificato a mano), avvisa e chiede conferma, perché salvando quelle modifiche andrebbero perse.
Regola pratica: **prima Carica, poi lavora, poi Salva**.

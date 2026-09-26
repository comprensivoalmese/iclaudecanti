# Sostituzioni docenti

Scheda **«Sostituzioni»** (la n. 9) di **Orario Facile**, per organizzare la **sostituzione dei docenti assenti**
usando il foglio del conteggio ore (chi è a **debito** e chi è a **credito** di ore).

Indirizzo diretto: **https://comprensivoalmese.github.io/iclaudecanti/orario-facile/#sostituzioni**
(il vecchio indirizzo `.../sostituzioni/` porta lì).

## Privacy: il foglio non viene pubblicato

Il foglio del conteggio ore contiene i nomi completi dei docenti, quindi **non va mai caricato su GitHub**
(il repository è pubblico).

- **Foglio su Google Drive** (consigliato): il Foglio Google «ORE 26-27 conteggio ore» (ID in `app/js/config.js`,
  campo `fileConteggioOre`) si legge da solo dopo «👁 Nomi», oppure con **"☁️ Carica dal Drive"**. Quando si assegna
  una sostituzione, la scheda scrive **+1** nella cella del docente che sostituisce, nella colonna della settimana
  (settimana 1 = quella del 9 settembre 2026); annullandola toglie 1. Le celle con una formula non vengono toccate:
  quelle ore restano "da riportare" a mano. Serve un vero Foglio Google (non un Excel caricato), la Google Sheets API
  attiva nel progetto Google Cloud e il permesso di modifica sul foglio per chi assegna. Codice: `js/drive.js`.
  **Prima di ogni scrittura** la scheda rilegge nel foglio COGNOME e NOME di quella riga: se le righe sono state
  riordinate, aggiunte o tolte ritrova quella giusta, altrimenti non scrive. Se il file dei nomi dice che il codice
  corrisponde a un'altra persona, non scrive e chiede di correggere l'abbinamento. L'avviso dice sempre in quale
  cella ha scritto (es. "settimana 3, cella G16: ora 1") oppure perché non ha potuto.
- Si carica dalla scheda con **"Carica il foglio"**: viene letto **solo nel browser** di quel computer,
  senza essere inviato a nessuno.
- Assenze, sostituzioni e foglio restano salvati **solo su quel dispositivo** (memoria del browser).
  Il pulsante "Cancella i dati delle sostituzioni da questo dispositivo" li toglie.
- Nel repo ci sono solo i **facsimili** con nomi inventati: `esempio/conteggio-ore-esempio.ods` e `.xlsx`.
- Se tenete una copia del foglio vero dentro la cartella del repo, mettetela in `privato/`:
  quella cartella è esclusa da git (vedi `.gitignore`).

## Chi può fare le sostituzioni e dove vengono scritte

Il Foglio Google **delle sostituzioni** (ID in `app/js/config.js`, campo `fileSostituzioni`) ha due fogli:

- **«Autorizzazioni»**: nomi ed **email** di chi può fare le sostituzioni. In cima alla scheda il riquadro
  **"Abilitazione alle sostituzioni"** controlla l'email di chi è entrato (pulsante *🔐 Verifica la mia abilitazione*;
  si controlla da solo se il permesso di Google c'è già, per esempio dopo «👁 Nomi»).
  Chi non è nell'elenco, o non può aprire il file, può **consultare** ma non registrare assenze né assegnare sostituzioni.
  Per autorizzare qualcuno basta aggiungere una riga con la sua email (in qualsiasi colonna; nome e cognome
  si prendono dalle colonne "Nome" e "Cognome"). Va bene anche se il foglio si chiama «Abilitazioni».
- **«Sostituzioni»**: ogni sostituzione assegnata diventa una **riga** (Data, Giorno, Ora, Classe, Aula, Materia,
  Docente assente, Docente sostituto, Inserita da, Inserita il, ID); annullandola la riga viene cancellata.
  Se il foglio è vuoto l'app scrive prima l'intestazione; se ci sono già delle colonne, riempie quelle con lo stesso nome.

**Nomi veri solo su Drive.** Nel foglio «Sostituzioni» i docenti compaiono con il **nome vero**, preso dal file
riservato dei nomi (`fileNomiDocenti`) e tenuto **solo in memoria**. Dopo la verifica dell'autorizzazione anche la
scheda mostra i nomi veri. Il file dei nomi collega i **codici** DOC01… ai nomi: se l'orario salvato sul dispositivo
usa ancora le iniziali ("F. A."), la scheda lo segnala e bisogna premere «Dati scuola 2026/27» in Orario Facile. Su GitHub e nella memoria del dispositivo
restano i codici DOC01, DOC02…: non scrivere mai nomi veri nei file del repository.

Serve la Google Sheets API attiva e, per chi assegna, il permesso di **modifica** sul foglio delle sostituzioni:
è Google stesso a impedire di scrivere a chi non ce l'ha. Codice: `js/registro-drive.js`.

## Cambi d'aula

Nella stessa scheda, sotto "Ore da coprire", il riquadro **"Cambi d'aula"** sposta una classe in un'altra aula
**solo in quel giorno** (l'orario base non cambia). C'è anche nella pagina **«⚡ Sostituzioni smart»** dell'app.

1. Si sceglie la **classe** e si toccano le **ore** da spostare (ognuna con la sua aula prevista).
2. Vengono proposte solo le **aule libere in tutte le ore scelte**, tenendo conto delle lezioni e degli altri cambi
   di quel giorno (un'aula lasciata da una classe spostata diventa disponibile).
3. **Motivo** facoltativo, poi **Registra il cambio d'aula**. Sotto c'è l'elenco dei cambi del giorno, con *Annulla*.

- Solo per gli autorizzati del foglio «Autorizzazioni», come le sostituzioni.
- Ogni cambio viene scritto nel foglio **«Cambi aula»** del Foglio Google delle sostituzioni (se non c'è, l'app lo crea),
  con il nome vero del docente; annullandolo la riga si cancella.
- I cambi del giorno sono anche nella **stampa** delle sostituzioni.
- Dati nella memoria del browser (chiave `sostituzioni.cambiAula`), condivisi tra Orario Facile e l'app.
  Codice: `js/cambi-aula.js`.

## Come si usa

1. **Carica il foglio** del conteggio ore (.ods, .xlsx oppure .csv, anche scaricato da Fogli Google).
2. Controlla gli **abbinamenti**: nell'orario i docenti sono codici (DOC01, DOC02…). Premi **«👁 Nomi»**
   in alto (serve il permesso sul file riservato dei nomi, su Google Drive): ogni docente viene collegato
   in automatico alla sua riga del foglio. Senza i nomi, o se un abbinamento manca o è dubbio, sceglilo dall'elenco.
3. Scegli il **giorno** e registra il **docente assente** spuntando le ore di assenza.
   La casella **"Permesso"** è spuntata di default: le ore di assenza sono **a debito** del docente, quindi nel foglio
   del conteggio su Drive la scheda legge la cella della settimana e **toglie 1 per ogni ora** (cella vuota → −1).
   Se si cambiano le ore o si toglie la spunta, corregge solo la differenza; togliendo l'assenza restituisce le ore.
   Se il foglio non è su Drive o il docente non è abbinato, un avviso dice quante ore togliere a mano.
   **Assente più giorni?** Sotto le ore compaiono gli altri giorni della **stessa settimana** in cui il docente ha
   lezione: spuntandoli, l'assenza viene registrata anche in quei giorni, per tutte le sue ore (una sola volta).
   Le correzioni del foglio del conteggio si fanno una alla volta, in fila, così la stessa cella non viene sbagliata.
4. In **"Ore da coprire"**, per ogni ora compare l'elenco dei docenti liberi: premi **Assegna**.
   In cima ci sono i **pulsanti dei giorni della settimana** con quante ore restano da coprire: servono per
   passare da un giorno all'altro e sistemare tutta la settimana.
   Le sostituzioni assegnate si vedono anche nella **tabella dell'orario** dell'app, sullo stesso dispositivo
   (vedi *Sostituzioni nella tabella* in `app/LEGGIMI.md`).
5. A fine settimana copia nel foglio le ore della tabella **"Da aggiungere nel foglio"** (+1 per ogni ora
   di sostituzione, nella colonna della settimana), poi premi **"Segna come già riportate"** e ricarica il foglio.

Si possono anche stampare le sostituzioni del giorno e scaricare il registro in CSV.

## Come vengono scelti i docenti proposti

Per ogni ora scoperta la scheda cerca i docenti **senza lezione in quell'ora**, **non assenti** e **non già
impegnati** in un'altra sostituzione alla stessa ora, e li mette in quest'ordine:

1. prima chi è **a scuola quel giorno** (ha almeno una lezione); gli altri si vedono con "Mostra tutti";
2. poi chi ha **più ore a debito** (saldo più basso);
3. a parità: chi ha un'**ora buca** (è già a scuola), poi chi ha lezione **subito prima o dopo**;
4. poi chi **conosce già la classe**.

Il saldo usato è: **TOTALE del foglio + sostituzioni fatte e non ancora riportate nel foglio**.
Se in classe c'è già un altro docente (compresenza), la scheda lo segnala.

## Il foglio: che forma deve avere

Come il foglio "Prospetto" della scuola:

| (n.) | COGNOME | NOME | 1 | 2 | 3 | … | 39 | TOTALE |
|---|---|---|---|---|---|---|---|---|
| 1 | ROSSI | Anna | -4 | -1 | | | | -5 |

- una riga di intestazione con **COGNOME** e **NOME**, poi le **settimane numerate** e **TOTALE**;
- numeri **negativi = ore a debito**, **positivi = ore a credito**;
- la nota "Settimana 1 dal 9 all'11 settembre 2026" (in qualsiasi cella) serve a calcolare la settimana
  di ogni data; se manca si usa lunedì 7 settembre 2026.

## L'orario

La scheda usa **l'orario aperto in Orario Facile**, quindi se lo modifichi le proposte si aggiornano appena torni
sulla scheda. L'orario viene trasformato con `Dati.normalizza()` di `app/js/dati.js`, lo stesso usato dall'app
Orario DADA.

## File

Il codice sta in file separati (non dentro `orario-facile/index.html`, che è già molto lungo): così chi lavora
su Orario Facile e chi lavora sulle sostituzioni tocca file diversi e ci sono meno conflitti.

```
sostituzioni/
  index.html              rimanda alla scheda di Orario Facile (per chi ha il vecchio indirizzo)
  css/sostituzioni.css    stile della scheda (usa i colori di Orario Facile, tema scuro, stampa)
  js/foglio.js            lettura del foglio .ods / .xlsx / .csv (senza librerie esterne)
  js/archivio.js          salvataggio nella memoria del browser (chiavi "sostituzioni.")
  js/abbinamenti.js       collegamento tra docenti dell'orario e righe del foglio
  js/drive.js             foglio del conteggio ore su Google Drive (+1 / -1 al sostituto)
  js/registro-drive.js    Foglio Google delle sostituzioni: foglio «Autorizzazioni», registri «Sostituzioni» e «Cambi aula»
  js/cambi-aula.js        modulo «Cambi d'aula» (scheda Sostituzioni e pagina «Sostituzioni smart» dell'app)
  js/sostituzioni.js      la scheda: assenze, proposte, saldi, esportazioni (Sostituzioni.monta)
  esempio/                facsimili del foglio con nomi inventati
```

In `orario-facile/index.html` le righe che la collegano sono poche: il foglio di stile nell'`<head>`, la sezione
`p-sostituzioni`, i `<script>` prima dello script principale, la voce in `TABS` e la funzione `renderSostituzioni()`.

Per provarla sul PC serve un piccolo server (dalla cartella del repo): `py -m http.server 8765`,
poi aprire http://localhost:8765/orario-facile/#sostituzioni

## Idee per il futuro

- scrivere direttamente il foglio aggiornato invece di copiare le ore a mano;
- condividere assenze e sostituzioni tra più computer (ora ogni computer ha i suoi dati);
- valutare se mostrare la scheda solo a chi organizza le sostituzioni (vicepresidenza).

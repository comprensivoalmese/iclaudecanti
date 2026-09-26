# Manuale Luis@i — Fruitori

*Team Wolf — risolvo problemi*

Guida per chi consulta l'orario delle lezioni: docenti, famiglie, monitor di classe e schermo all'ingresso.
Non serve nessuna abilitazione speciale: basta l'account Google della scuola.

Indirizzo: **https://comprensivoalmese.github.io/orario/app/**
Accesso: account **@comprensivoalmese.it**

## In breve

1. Apri l'indirizzo dell'app e accedi con **"Accedi con Google"** (account della scuola).
2. Vedi subito l'**orario di oggi**: se sei un docente riconosciuto, vedi già il tuo; sui monitor di classe si vede l'aula.
3. Tocca **In breve** in alto per la vista a schede (comoda sul telefono): Adesso, Dopo, il resto della giornata.
4. Usa i filtri (Classe, Docente, Aula) e il cambio colonna per vedere l'orario di qualcun altro o la settimana intera.
5. Dal menu in alto a destra, **📲 Installa l'app** per averla come un'app vera sulla schermata Home.
6. Se cambia qualcosa all'ultimo momento, compare un riquadro giallo in alto con le modifiche del giorno.

## Come accedere

L'app si apre nel browser (Chrome, Edge, Safari…), non serve installare nulla per usarla la prima volta.
Si entra con **"Accedi con Google"**: sono accettati solo gli account **@comprensivoalmese.it**. La password la vede
solo Google, l'app non la riceve mai.

Spuntando **"Ricordami su questo dispositivo"** l'accesso resta memorizzato per 30 giorni.

## Cosa vedi appena apri l'app

L'app riconosce da sola chi sta guardando:

| Chi apre l'app | Cosa vede |
|---|---|
| Monitor di classe | l'orario di oggi della **sua aula**, a caratteri grandi, con "Adesso / Dopo" |
| Schermo all'ingresso | l'orario di oggi con le viste **Classi → Docenti → Aule** che cambiano da sole |
| Docente (riconosciuto dall'email) | il **suo orario di oggi**, con "Adesso / Dopo" |
| Tutti gli altri | l'**orario di oggi**: ore in riga, classi in colonna |

L'ora in corso è sempre evidenziata in **giallo**. Nel weekend, o a lezioni finite, compare già il giorno di scuola
successivo.

## La vista "In breve" (a schede)

Il tasto **In breve** apre la giornata a schede, pensata per il telefono. Il tasto **Tabella** torna alla vista classica.

- **Adesso**: la lezione in corso, con l'aula in grande e quanto manca alla fine dell'ora.
- **Dopo**: la lezione successiva; se cambia l'aula lo dice ("si cambia aula: Aula 1 → Aula 4").
- **Il resto della giornata**: una scheda per ogni ora, con l'ora in corso gialla.
- **Giornata di**: si sceglie classe, docente o aula; la scelta resta memorizzata sul dispositivo.

Sui monitor di classe questo tasto non c'è: lì resta sempre la tabella a caratteri grandi.

## Cambiare visualizzazione e usare i filtri

Si può mettere **in colonna**: Classi, Docenti, Aule oppure Settimana. Si possono combinare i filtri **Classe**,
**Docente** e **Aula**. Esempi:

| Combinazione | Risultato |
|---|---|
| Docenti in colonna + classe 2B | tutti i docenti che entrano in 2B quel giorno |
| Settimana + docente Rossi | la settimana intera della prof.ssa Rossi |
| Classi in colonna + aula Palestra | quali classi vanno in palestra e quando |
| Settimana + classe 1A + docente Costa | le ore di Costa nella 1A |

I pulsanti dei giorni cambiano il giorno mostrato; **Oggi** torna sempre al giorno corrente.

## Installare l'app e condividerla

Dal menu in alto a destra (il tondo con le iniziali):

- **📲 Installa l'app su questo dispositivo** — su Chrome/Edge parte subito l'installazione; su iPhone/iPad compaiono
  le istruzioni (Safari → Condividi → Aggiungi alla schermata Home).
- **🔗 Condividi l'app con i colleghi** — mostra un QR code grande, con i pulsanti per condividere via WhatsApp/email
  o copiare il link.

## Il tema

Dal menu: **Come il dispositivo**, **Chiaro**, **Scuro** oppure **Secondo l'ora** (scuro dalle 19 alle 7). La scelta
resta memorizzata su quel dispositivo.

## La campanella 🔔

Il tasto con la campanella fa suonare il dispositivo agli orari della campanella.

- Si sceglie **quando suonare**: al cambio d'ora, qualche minuto prima (1, 2, 3, 5 o 10 minuti) o entrambi.
- Suono diverso per il cambio d'ora ("din-don") e per il preavviso (bip leggeri); su Android vibra anche.

> **Limite dei siti web.** Suona solo con l'app aperta sullo schermo e il volume alzato (su iPhone va tolto anche il
> silenzioso). Con telefono bloccato o app chiusa non può suonare: per questo c'è l'opzione *Tieni acceso lo schermo*.

## Modifiche dell'ultimo minuto

Quando l'orario pubblicato cambia, l'app lo segnala: ricontrolla l'orario ogni 5 minuti.

- Se sono cambiate lezioni della giornata compare un riquadro giallo **"⚠️ Modifiche all'orario di oggi"**.
- Le modifiche si vedono **in stile storie** (come Instagram): cerchi colorati in alto, grigi quando già visti; anello
  arancione se riguardano direttamente il docente. Toccando un cerchio si apre a tutto schermo: com'era prima
  (barrato) e com'è adesso.
- Nella tabella le lezioni cambiate hanno il bordo evidenziato e l'etichetta **CAMBIATA**.
- **Segna tutte come viste** ingrigisce i cerchi.
- Con **🔔 Avvisami anche con una notifica** (sui dispositivi personali) arriva anche la notifica del telefono/PC.

## Monitor di classe e schermo all'ingresso

Chi gestisce questi dispositivi apre l'app con un indirizzo dedicato:

- **Monitor di un'aula**: `.../app/?monitor=Aula%203` (o menu → "Uso di questo dispositivo" → l'aula).
- **Schermo all'ingresso**: `.../app/?ingresso`, cambia vista da solo ogni tot secondi (Classi → Docenti → Aule).

Sulle LIM, durante gli intervalli (9:55–10:05 e 11:50–12:05) l'app mostra dove va ogni classe nell'ora successiva.
Le istruzioni tecniche per l'apertura automatica sono in `app/lim/` nel repository.

## Domande frequenti

**Non riesco ad accedere.** Controlla di usare l'account Google della scuola (`@comprensivoalmese.it`), non uno personale.

**Vedo un orario diverso da quello vero.** L'app si aggiorna da sola ogni 5 minuti: aspetta qualche minuto o ricarica
la pagina. Se il problema resta, segnalalo a chi gestisce il sito.

**Non sento la campanella.** Controlla che l'app sia aperta sullo schermo, il volume alzato e (su iPhone) il
silenzioso disattivato: è un limite dei siti web, non un guasto.

**Voglio modificare l'orario o fare una sostituzione.** Serve il ruolo di *modificatore* e l'app **Orario Facile**:
vedi il manuale dedicato ai modificatori.

---
*Guida basata sulla documentazione del progetto «orario» (repository comprensivoalmese/orario) (`app/LEGGIMI.md`), aggiornata al 25/09/2026.*

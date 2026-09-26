/*
  condividi.js – voce di menu "Condividi l'app con i colleghi".
  Mostra il QR code da inquadrare e i pulsanti per condividere o copiare il link.
  Il QR (icone/qr-app.svg) è un'immagine già pronta: funziona anche senza connessione.
*/
(() => {
  const $ = sel => document.querySelector(sel);
  const indirizzo = CONFIG.indirizzoApp;

  function esito(testo) { $('#esitoCondividi').textContent = testo; }

  function apri() {
    $('#menu').hidden = true;
    $('#btnUtente').setAttribute('aria-expanded', 'false');
    esito('');
    $('#finestraCondividi').showModal();
  }

  // "Condividi…" apre il menu di condivisione del telefono (WhatsApp, email, ...)
  async function condividi() {
    try {
      await navigator.share({
        title: 'Luis@i',
        text: 'Orario delle lezioni: apri il link, accedi con l’account della scuola e installa l’app dal menu.',
        url: indirizzo
      });
    } catch (e) { /* condivisione annullata: nessun problema */ }
  }

  async function copia() {
    try {
      await navigator.clipboard.writeText(indirizzo);
      esito('Link copiato: incollalo in un messaggio o in una email.');
      return;
    } catch (e) { /* browser vecchio o permesso negato: provo il metodo classico */ }
    // Metodo di riserva: seleziono l'indirizzo scritto sotto il QR e uso il comando "copia"
    const selezione = window.getSelection(), intervallo = document.createRange();
    intervallo.selectNodeContents($('#indirizzoApp'));
    selezione.removeAllRanges();
    selezione.addRange(intervallo);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* non supportato */ }
    esito(ok ? 'Link copiato: incollalo in un messaggio o in una email.'
             : 'Copia non riuscita: l’indirizzo è selezionato, copialo a mano.');
  }

  $('#indirizzoApp').textContent = indirizzo;
  $('#qrApp').alt = 'QR code che apre l’app Luis@i all’indirizzo ' + indirizzo;
  $('#btnCondividiLink').hidden = !navigator.share;   // non tutti i browser lo permettono
  $('#btnCondividi').addEventListener('click', apri);
  $('#btnCondividiLink').addEventListener('click', condividi);
  $('#btnCopiaLink').addEventListener('click', copia);
  $('#btnChiudiCondividi').addEventListener('click', () => $('#finestraCondividi').close());
})();

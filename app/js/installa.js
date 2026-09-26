/*
  installa.js – pulsante "Installa l'app su questo dispositivo" in fondo al menu.

  - Chrome ed Edge (Android, Windows, monitor): il browser offre un'installazione vera e propria,
    che parte premendo il pulsante.
  - iPhone/iPad e browser che non lo permettono: si apre una finestra con le istruzioni.
  - Se l'app è già installata (aperta dall'icona) il pulsante non compare.
*/
(() => {
  const $ = sel => document.querySelector(sel);
  let richiesta = null;   // l'offerta di installazione del browser, da usare al momento del clic

  const installata = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

  function aggiornaPulsante() {
    $('#btnInstalla').hidden = installata();
  }

  // Il browser comunica che l'app si può installare: teniamo da parte l'offerta
  window.addEventListener('beforeinstallprompt', evento => {
    evento.preventDefault();
    richiesta = evento;
  });
  window.addEventListener('appinstalled', () => { richiesta = null; aggiornaPulsante(); });

  // Istruzioni adatte al dispositivo, per quando il browser non installa da solo
  function istruzioni() {
    const ua = navigator.userAgent;
    const apple = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    if (apple) {
      // iPad (anche quelli che si presentano come "Macintosh" con lo schermo touch) o iPhone
      const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      return `<ol>
        <li>Apri questa pagina con <strong>Safari</strong> (la fotocamera la apre già lì).</li>
        <li>Tocca il pulsante <strong>Condividi</strong>, il quadrato con la freccia verso l'alto
          (${ipad ? 'in alto a destra, accanto alla barra dell\'indirizzo' : 'in basso al centro'}).</li>
        <li><strong>Scorri verso il basso</strong> l'elenco delle azioni e scegli <strong>Aggiungi alla schermata Home</strong>,
          poi tocca <strong>Aggiungi</strong>.</li>
        <li>Apri l'app dall'icona <strong>Luis@i</strong> sulla schermata Home ed entra con l'account della scuola
          (la prima volta va fatto anche se eri già entrato in Safari).</li>
      </ol>
      <p><strong>Non trovi «Aggiungi alla schermata Home»?</strong></p>
      <ul>
        <li>In fondo all'elenco tocca <strong>Modifica azioni…</strong> e attiva <strong>Aggiungi alla schermata Home</strong>.</li>
        <li>Controlla di essere in <strong>Safari</strong> e non nel browser interno di un'altra app (lettore QR, WhatsApp, Gmail):
          in quel caso tocca <strong>Apri in Safari</strong>.</li>
        <li>Esci dalla <strong>navigazione privata</strong> (barra scura con scritto «Privata»).</li>
        <li>Sugli iPad gestiti dalla scuola la voce può essere bloccata: chiedi a chi gestisce gli iPad.</li>
      </ul>`;
    }
    if (/Firefox/.test(ua) && !/Android/.test(ua)) {
      return '<p>Firefox per computer non installa le app web. Apri questa pagina con <strong>Chrome</strong> o <strong>Edge</strong> e riprova.</p>';
    }
    if (/Android/.test(ua)) {
      return `<ol>
        <li>Apri il menu del browser (<strong>⋮</strong> in alto a destra).</li>
        <li>Scegli <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.</li>
      </ol>`;
    }
    return `<ol>
      <li>Cerca l'icona <strong>Installa</strong> a destra nella barra degli indirizzi,</li>
      <li>oppure apri il menu del browser (<strong>⋮</strong> o <strong>…</strong>) e scegli
        <strong>Installa Luis@i</strong> (in Edge: <strong>App → Installa questo sito come app</strong>).</li>
    </ol>`;
  }

  async function installa() {
    $('#menu').hidden = true;
    $('#btnUtente').setAttribute('aria-expanded', 'false');
    if (richiesta) {
      richiesta.prompt();                 // finestra di installazione del browser
      await richiesta.userChoice;
      richiesta = null;                   // l'offerta si può usare una volta sola
      return;
    }
    $('#istruzioniInstalla').innerHTML = istruzioni();
    $('#finestraInstalla').showModal();
  }

  $('#btnInstalla').addEventListener('click', installa);
  $('#btnChiudiInstalla').addEventListener('click', () => $('#finestraInstalla').close());
  aggiornaPulsante();

  // Indirizzo .../app/?installa (QR code "Installa l'app"): le istruzioni compaiono subito, anche prima
  // dell'accesso. Poi togliamo "?installa" dall'indirizzo, così l'icona sulla schermata Home apre l'app normale.
  if (new URLSearchParams(location.search).has('installa') && !installata()) {
    history.replaceState(null, '', location.pathname);
    $('#istruzioniInstalla').innerHTML = istruzioni();
    $('#finestraInstalla').showModal();
  }
})();

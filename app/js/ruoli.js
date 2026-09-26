/*
  ruoli.js – chi può MODIFICARE l'orario e chi può solo CONSULTARLO.

  - "Modificatori": possono usare Orario Facile (preparare l'orario, sostituzioni…).
  - Tutti gli altri account della scuola sono "fruitori": vedono l'orario nell'app, ma non lo modificano.

  L'elenco dei modificatori è in config.js (campo "editori"). Il repository è pubblico, quindi lì
  NON scriviamo gli indirizzi email: scriviamo un "codice" di 16 caratteri ricavato dall'email
  con un calcolo a senso unico (SHA-256): dal codice non si risale all'email.
  Chi non è abilitato vede il proprio codice nella schermata di Orario Facile e lo manda a chi gestisce l'app.

  Attenzione: il sito è fatto solo di file pubblici (GitHub Pages), quindi questo controllo avviene nel
  browser. Serve a separare i ruoli nell'uso normale; la vera protezione dell'orario pubblicato è che
  per cambiare dati/orario.json bisogna poter modificare il repository su GitHub.
*/
const Ruoli = (() => {
  // Il codice di un'email, es. "3f9a0c1d2e4b5a6f"
  async function codice(email) {
    const testo = 'iclaudecanti|' + String(email || '').trim().toLowerCase();
    const impronta = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
    return Array.from(new Uint8Array(impronta)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  }

  // Elenco dei codici abilitati (in minuscolo, senza spazi)
  const elenco = () => (CONFIG.editori || []).map(c => String(c).trim().toLowerCase()).filter(Boolean);

  // Finché l'elenco è vuoto, chiunque della scuola può modificare (come prima di questa funzione)
  const elencoVuoto = () => elenco().length === 0;

  async function puoModificare(email) {
    if (!email) return false;
    if (elencoVuoto()) return true;
    try {
      return elenco().includes(await codice(email));
    } catch (e) {
      return false;   // browser senza crittografia (pagina non sicura): per prudenza, solo consultazione
    }
  }

  return { codice, puoModificare, elencoVuoto };
})();

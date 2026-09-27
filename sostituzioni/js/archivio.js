/*
  archivio.js – salva e rilegge i dati delle sostituzioni nella memoria del browser (localStorage).
  I dati restano SOLO su questo dispositivo: niente viene pubblicato su GitHub.
  Tutte le chiavi iniziano con "sostituzioni." per non confondersi con le altre app del sito.
*/
const Archivio = (() => {
  const CHIAVI = {
    foglio: 'sostituzioni.foglio',             // il foglio del conteggio ore caricato
    assenze: 'sostituzioni.assenze',           // le assenze registrate
    registro: 'sostituzioni.registro',         // le sostituzioni assegnate
    abbinamenti: 'sostituzioni.abbinamenti',   // abbinamenti scelti a mano: docente dell'orario -> riga del foglio
    annullate: 'sostituzioni.annullate'        // sostituzioni di ALTRI dispositivi annullate da qui (vedi annullaVoce)
  };

  // Legge un dato; se manca o la memoria è bloccata restituisce il valore predefinito
  function leggi(nome, predefinito) {
    try {
      const testo = localStorage.getItem(CHIAVI[nome]);
      return testo ? JSON.parse(testo) : predefinito;
    } catch (e) {
      return predefinito;
    }
  }

  // Scrive un dato; restituisce false se non è stato possibile (memoria piena o bloccata)
  function scrivi(nome, valore) {
    try {
      localStorage.setItem(CHIAVI[nome], JSON.stringify(valore));
      return true;
    } catch (e) {
      return false;
    }
  }

  function cancellaTutto() {
    Object.values(CHIAVI).forEach(k => {
      try { localStorage.removeItem(k); } catch (e) { /* ignorato */ }
    });
  }

  // Serve per accorgersi dei cambiamenti fatti in un'altra scheda
  const eNostra = chiave => Object.values(CHIAVI).includes(chiave);

  return { leggi, scrivi, cancellaTutto, eNostra };
})();

/*
  porta.js – la "porta d'ingresso" di Orario Facile.

  Orario Facile serve a MODIFICARE l'orario (e a organizzare le sostituzioni), quindi entra solo
  chi è autorizzato: si accede con l'account Google della scuola (lo stesso dell'app Luis@i,
  se si è già entrati lì non lo richiede) e poi si controlla la colonna «Orario Facile» della scheda
  «Autorizzazioni» del Foglio Database (../app/js/autorizzazioni.js). Per leggerla serve il permesso di Google:
  se non c'è ancora compare il tasto «Verifica con Google» (la finestra di Google si apre solo dopo un tocco).
  Finché quella scheda non esiste valgono i codici di CONFIG.editori (ruoli.js), come prima.
  Chi può solo consultare l'orario viene mandato all'app.

  Usa i file dell'app: ../app/js/config.js, accesso.js, ruoli.js, nomi.js e autorizzazioni.js.
*/
(() => {
  const radice = document.documentElement;
  // Finché non sappiamo chi è, Orario Facile resta nascosto (vedi porta.css)
  radice.classList.add('porta-chiusa');

  // Gli id "schermataAccesso", "pulsanteGoogle"… sono quelli usati da accesso.js
  const STRUTTURA = `
    <div class="porta-scheda">
      <p id="portaAttesa" class="porta-nota">Controllo dell'accesso…</p>

      <div id="schermataAccesso" hidden>
        <h1>Orario Facile</h1>
        <p>Qui si prepara e si modifica l'orario. Accedi con il tuo account della scuola <strong id="dominioAccesso"></strong>.</p>
        <label class="porta-ricordami"><input type="checkbox" id="ricordami" checked> Ricordami su questo dispositivo</label>
        <div id="pulsanteGoogle" class="porta-google"></div>
        <form id="moduloDemo" class="porta-demo" hidden novalidate>
          <p class="porta-nota"><strong>Modalità dimostrativa.</strong> L'accesso con Google non è configurato: l'indirizzo non viene verificato.</p>
          <label for="emailDemo">Email della scuola</label>
          <input type="email" id="emailDemo" autocomplete="email" inputmode="email" required>
          <button type="submit" class="btn">Entra</button>
        </form>
        <p id="erroreAccesso" class="porta-errore" role="alert"></p>
        <p class="porta-nota">Vuoi solo consultare l'orario? <a href="../app/">Apri l'app Luis@i</a>.</p>
      </div>

      <div id="portaVerifica" hidden>
        <h1>Orario Facile</h1>
        <p>Per entrare controllo le tue autorizzazioni nel Foglio Database della scuola: serve il permesso di Google.</p>
        <div class="porta-azioni"><button type="button" id="portaVerificaTasto" class="btn">Verifica con Google</button></div>
        <p id="portaVerificaEsito" class="porta-errore" role="alert"></p>
      </div>

      <div id="portaNegata" hidden>
        <h1>Solo consultazione</h1>
        <p id="portaSaluto"></p>
        <div class="porta-azioni">
          <a class="btn" href="../app/">Vai all'orario</a>
          <button type="button" id="portaEsci" class="btn ghost">Esci e cambia account</button>
        </div>
        <p id="portaComeFoglio" class="porta-nota" hidden>Se devi preparare l'orario, chiedi di essere aggiunto nella scheda
          «Autorizzazioni» del Foglio Database, con SI nella colonna «Orario Facile».</p>
        <div id="portaComeCodice">
          <p class="porta-nota">Se devi preparare l'orario o le sostituzioni, chiedi a chi gestisce l'app di abilitarti
            comunicando questo codice (non contiene la tua email):</p>
          <p class="porta-codice"><code id="portaCodice"></code>
            <button type="button" id="portaCopia" class="btn ghost sm">Copia</button></p>
          <p id="portaEsito" class="porta-nota" role="status"></p>
        </div>
      </div>
    </div>`;

  let porta = null;
  const $ = id => document.getElementById(id);

  // Utente abilitato: si apre Orario Facile e nella barra in alto compare "Esci"
  function apri(s) {
    radice.classList.remove('porta-chiusa');
    porta.remove();
    const barra = document.querySelector('.bar-actions');
    if (barra) {
      const esci = document.createElement('button');
      esci.type = 'button';
      esci.className = 'btn ghost sm';
      esci.textContent = 'Esci';
      esci.title = 'Esci da ' + s.email;
      esci.addEventListener('click', () => Accesso.esci());
      barra.append(esci);
    }
  }

  // Utente non abilitato: può solo consultare
  async function negato(s, dalFoglio) {
    $('portaVerifica').hidden = true;
    $('portaNegata').hidden = false;
    // con la scheda «Autorizzazioni» basta farsi aggiungere lì; il codice serve solo con le regole di prima (CONFIG.editori)
    $('portaComeFoglio').hidden = !dalFoglio;
    $('portaComeCodice').hidden = !!dalFoglio;
    $('portaSaluto').textContent = `Ciao ${s.nome}: il tuo account (${s.email}) può consultare l'orario, ma non modificarlo.`;
    let codice = '';
    try { codice = await Ruoli.codice(s.email); } catch (e) { codice = 'non disponibile (serve una pagina https)'; }
    $('portaCodice').textContent = codice;
    $('portaEsci').addEventListener('click', () => Accesso.esci());
    $('portaCopia').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(codice); $('portaEsito').textContent = 'Codice copiato.'; }
      catch (e) { $('portaEsito').textContent = 'Non riesco a copiare: selezionalo e copialo a mano.'; }
    });
    $('portaNegata').querySelector('a').focus();
  }

  document.addEventListener('DOMContentLoaded', () => {
    porta = document.createElement('div');
    porta.id = 'porta';
    porta.className = 'porta';
    porta.innerHTML = STRUTTURA;
    document.body.prepend(porta);

    // Se mancano i file dell'app non possiamo controllare chi è: per prudenza non si entra
    if (typeof CONFIG === 'undefined' || typeof Accesso === 'undefined' || typeof Ruoli === 'undefined' || typeof Autorizzazioni === 'undefined') {
      $('portaAttesa').textContent = 'Impossibile controllare l\'accesso: mancano i file della cartella app/. Ricarica la pagina.';
      return;
    }
    if (!Accesso.sessione()) $('portaAttesa').hidden = true;   // comparirà la schermata di accesso
    // L'esito del controllo si ricorda fino a sera su questo dispositivo (solo email, sì/no e data): così non serve
    // premere «Verifica con Google» a ogni apertura. Il giorno dopo si ricontrolla.
    const CHIAVE = 'orariofacile.autorizzazione';
    const oggi = () => new Date().toISOString().slice(0, 10);
    const ricordato = email => { try { const x = JSON.parse(localStorage.getItem(CHIAVE) || 'null'); return x && x.email === email && x.data === oggi() ? x : null; } catch (e) { return null; } };
    const ricorda = (email, of) => { try { localStorage.setItem(CHIAVE, JSON.stringify({ email, of, data: oggi() })); } catch (e) { /* ignorato */ } };
    // decide in base alle autorizzazioni: entra, non entra, oppure serve prima il permesso di Google
    const decidi = (s, a) => {
      if (a.fonte === 'attesa') {
        const r = ricordato(s.email);
        if (r && r.of) { apri(s); return; }
        $('portaVerifica').hidden = false; $('portaVerificaTasto').focus(); return;
      }
      ricorda(s.email, !!a.orarioFacile);
      if (a.orarioFacile) apri(s); else negato(s, a.fonte === 'foglio');
    };
    Accesso.avvia(async s => {
      $('portaAttesa').hidden = true;
      decidi(s, await Autorizzazioni.di(s.email));
      // «Verifica con Google»: il tocco permette a Google di aprire la finestra del permesso
      // (se si è già entrati, la porta non c'è più e il tasto nemmeno: niente da collegare)
      const tasto = $('portaVerificaTasto');
      if (tasto) tasto.onclick = async () => {
        $('portaVerificaEsito').textContent = '';
        const a = await Autorizzazioni.di(s.email, true);
        if (a.fonte === 'attesa') $('portaVerificaEsito').textContent = 'Google non ha dato il permesso: riprova (se il browser blocca le finestre, consentile per questo sito).';
        else decidi(s, a);
      };
    });
  });
})();

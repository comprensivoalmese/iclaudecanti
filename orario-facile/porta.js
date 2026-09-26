/*
  porta.js – la "porta d'ingresso" di Orario Facile.

  Orario Facile serve a MODIFICARE l'orario (e a organizzare le sostituzioni), quindi entra solo
  chi è abilitato: si accede con l'account Google della scuola (lo stesso dell'app Luis@i,
  se si è già entrati lì non lo richiede) e poi si controlla il ruolo con Ruoli.puoModificare.
  Chi può solo consultare l'orario viene mandato all'app, con il codice da comunicare
  a chi gestisce l'app se deve essere abilitato.

  Usa i file dell'app: ../app/js/config.js, ../app/js/accesso.js e ../app/js/ruoli.js.
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

      <div id="portaNegata" hidden>
        <h1>Solo consultazione</h1>
        <p id="portaSaluto"></p>
        <div class="porta-azioni">
          <a class="btn" href="../app/">Vai all'orario</a>
          <button type="button" id="portaEsci" class="btn ghost">Esci e cambia account</button>
        </div>
        <p class="porta-nota">Se devi preparare l'orario o le sostituzioni, chiedi a chi gestisce l'app di abilitarti
          comunicando questo codice (non contiene la tua email):</p>
        <p class="porta-codice"><code id="portaCodice"></code>
          <button type="button" id="portaCopia" class="btn ghost sm">Copia</button></p>
        <p id="portaEsito" class="porta-nota" role="status"></p>
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
  async function negato(s) {
    $('portaNegata').hidden = false;
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
    if (typeof CONFIG === 'undefined' || typeof Accesso === 'undefined' || typeof Ruoli === 'undefined') {
      $('portaAttesa').textContent = 'Impossibile controllare l\'accesso: mancano i file della cartella app/. Ricarica la pagina.';
      return;
    }
    if (!Accesso.sessione()) $('portaAttesa').hidden = true;   // comparirà la schermata di accesso
    Accesso.avvia(async s => {
      $('portaAttesa').hidden = true;
      if (await Ruoli.puoModificare(s.email)) apri(s); else negato(s);
    });
  });
})();

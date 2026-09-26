# apertura-intervallo.ps1 - Orario DADA sulle LIM con Windows (PC OPS)
#
# Una pagina web non puo' aprirsi da sola quando e' chiusa: per questo usiamo
# l'Utilita' di pianificazione di Windows, che apre l'app agli orari degli intervalli
# (dal lunedi' al venerdi') gia' nella modalita' monitor dell'aula e a schermo intero.
# Finito l'intervallo l'app prova a chiudere da sola la finestra che ha aperto.
#
# Uso (di solito tramite installa-apertura-intervallo.bat):
#   .\apertura-intervallo.ps1 -Aula "110ITA4"              programma l'apertura
#   .\apertura-intervallo.ps1 -Aula "110ITA4" -Prova       mostra cosa farebbe, senza cambiare niente
#   .\apertura-intervallo.ps1 -Rimuovi                     toglie l'apertura programmata
#
# Gli orari devono essere gli stessi di "intervalliLim" in app/js/config.js.

param(
  [string]$Aula = '',
  [string[]]$Orari = @('09:55', '11:50'),
  [string]$Indirizzo = 'https://comprensivoalmese.github.io/iclaudecanti/app/',
  [switch]$Rimuovi,
  [switch]$Prova
)

$prefisso = 'Orario DADA - intervallo'

# --- Togliere l'apertura programmata ---
if ($Rimuovi) {
  $attivita = Get-ScheduledTask -TaskName "$prefisso*" -ErrorAction SilentlyContinue
  if (-not $attivita) { Write-Host 'Nessuna apertura programmata da togliere.'; exit 0 }
  foreach ($a in $attivita) {
    if ($Prova) { Write-Host "[prova] toglierei: $($a.TaskName)" }
    else { Unregister-ScheduledTask -TaskName $a.TaskName -Confirm:$false; Write-Host "Tolta: $($a.TaskName)" }
  }
  exit 0
}

if (-not $Aula.Trim()) { Write-Host "Manca il nome dell'aula (es. -Aula ""110ITA4"")."; exit 1 }

# --- Dove si trova Microsoft Edge ---
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $edge) { Write-Host 'Microsoft Edge non trovato su questo computer.'; exit 1 }

# --- Indirizzo dell'app: monitor dell'aula + "aperta per l'intervallo" ---
$url = $Indirizzo + '?monitor=' + [uri]::EscapeDataString($Aula.Trim()) + '&intervallo'
# --app apre l'app in una finestra senza barre, --start-fullscreen a tutto schermo.
# Si usa il profilo normale di Edge, cosi' l'accesso "Ricordami" resta valido.
$argomenti = "--app=""$url"" --start-fullscreen"

$giorni = 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'
foreach ($ora in $Orari) {
  if ($ora -notmatch '^\d{1,2}:\d{2}$') { Write-Host "Orario non valido: $ora (serve HH:MM)"; exit 1 }
  $nome = "$prefisso $($ora.Replace(':', '.'))"
  if ($Prova) {
    Write-Host "[prova] $nome : dal lunedi' al venerdi' alle $ora apre"
    Write-Host "        $edge $argomenti"
    continue
  }
  $azione = New-ScheduledTaskAction -Execute $edge -Argument $argomenti
  $quando = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $giorni -At $ora
  # Ora locale senza fuso orario: cosi' con il passaggio all'ora solare/legale resta alle $ora
  $quando.StartBoundary = (Get-Date $ora).ToString('yyyy-MM-ddTHH:mm:ss')
  # Nessun limite di durata (altrimenti Windows chiuderebbe Edge) e niente recupero se la LIM era spenta
  $regole = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $nome -Action $azione -Trigger $quando -Settings $regole `
    -Description "Apre Orario DADA sulla LIM dell'aula $Aula all'intervallo" -Force | Out-Null
  Write-Host "Programmata: $nome (dal lunedi' al venerdi' alle $ora)"
}
if (-not $Prova) {
  Write-Host ''
  Write-Host "Fatto. Ricorda: sulla LIM bisogna aver fatto una volta l'accesso all'app con 'Ricordami' spuntato."
}

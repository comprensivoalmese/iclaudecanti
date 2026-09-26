# strumenti/crea-database.ps1 – vedi orario-facile/DATABASE.md. Uso: powershell -ExecutionPolicy Bypass -File strumenti\crea-database.ps1 -Backup dati\orario.json -Uscita "C:\...\Orario database.xlsx" (serve Excel per Windows)
# Crea il FILE DATABASE dell'orario (xlsx da caricare su Google Drive e aprire come Foglio Google)
# a partire da un backup di Orario Facile (es. dati/orario.json).
# Il formato è descritto in orario-facile/DATABASE.md: Orario Facile legge e scrive le colonne "dati",
# le colonne calcolate (formule) e i colori li mette questo script una volta sola.
param([string]$Backup, [string]$Uscita)
$DB = Get-Content $Backup -Raw -Encoding UTF8 | ConvertFrom-Json

# ---------- dimensioni fisse del modello (Orario Facile usa le stesse: vedi orario-facile/database.js) ----------
$ND = 120      # righe per i docenti (Docenti, Orario)
$NK = 400      # righe per le cattedre
$NCL = 40      # righe per le classi
$SLOT_MAX = 60 # colonne per le ore della settimana nella griglia (C..BJ)
$fD = $ND + 1; $fO = $ND + 2; $fK = $NK + 1; $fCl = $NCL + 1
$GIALLO = 13434879; $GRIGIO = 15921906; $BLU = 12611584; $BIANCO = 16777215

# ---------- dati di Orario Facile ----------
$giorni = @($DB.giorni); $oreM = [int]$DB.oreM; $oreP = [int]$DB.oreP; $NSL = $oreM + $oreP
$doc = [ordered]@{}; foreach ($t in $DB.docenti) { $doc[$t.id] = $t }
$dis = @{}; foreach ($d in $DB.discipline) { $dis[$d.id] = $d }
$aul = @{}; foreach ($a in $DB.aule) { $aul[$a.id] = $a }
$cla = @{}; foreach ($c in $DB.classi) { $cla[$c.id] = $c }
function Etichetta($s) { if ($s -lt $oreM) { "$($s + 1)ª" } else { "$($s - $oreM + 1)ª pom." } }
function SiNo($v) { if ($v) { 'SI' } else { 'NO' } }

# griglia docente x ora: testo della cella secondo la scrittura breve ("1A", "1A STO", "1A ITA @MENSA", "+2B SOS", " *")
$griglia = @{}; foreach ($t in $DB.docenti) { $griglia[$t.id] = New-Object string[] ($giorni.Count * $NSL) }
$avvisi = @()
foreach ($cid in $DB.orario.PSObject.Properties.Name) {
  $c = $cla[$cid]; if (-not $c) { continue }
  for ($gi = 0; $gi -lt $giorni.Count; $gi++) {
    $arr = $DB.orario.$cid.($giorni[$gi]); if (-not $arr) { continue }
    for ($s = 0; $s -lt [math]::Min($NSL, $arr.Count); $s++) {
      $v = $arr[$s]; if (-not $v -or -not $v.doc) { continue }
      $t = $doc[$v.doc]; if (-not $t) { continue }
      $materie = @($t.cattedre | Where-Object { $_.cl -eq $cid } | ForEach-Object { $_.di } | Sort-Object -Unique)
      $txt = $c.nome
      if (-not ($materie.Count -eq 1 -and $materie[0] -eq $v.dis) -and $v.dis -and $dis[$v.dis]) { $txt += ' ' + $dis[$v.dis].sigla }
      $principale = if ($t.aule.Count) { $t.aule[0] } else { '' }
      if ($v.aula -and $v.aula -ne $principale -and $aul[$v.aula]) { $txt += ' @' + $aul[$v.aula].nome }
      if ($v.lock) { $txt += ' *' }
      $k = $gi * $NSL + $s
      if ($griglia[$v.doc][$k]) { $avvisi += "$($t.nome) ha due lezioni $($giorni[$gi]) $(Etichetta $s)" } else { $griglia[$v.doc][$k] = $txt }
      foreach ($x in @($v.co)) { if ($x -and $x.doc -and $griglia.ContainsKey($x.doc)) { $griglia[$x.doc][$k] = '+' + $c.nome + $(if ($x.att) { ' ' + $x.att } else { '' }) } }
    }
  }
}

$x = New-Object -ComObject Excel.Application
$x.Visible = $false; $x.DisplayAlerts = $false
try {
  $wb = $x.Workbooks.Add()
  $nomi = 'LEGGIMI', 'Impostazioni', 'Vincoli', 'Discipline', 'Aule', 'Classi', 'Quadro', 'Docenti', 'Cattedre', 'Orario', 'Vista classi', 'Controlli'
  while ($wb.Worksheets.Count -lt $nomi.Count) { [void]$wb.Worksheets.Add([Type]::Missing, $wb.Worksheets.Item($wb.Worksheets.Count)) }
  $FG = @{}; for ($i = 0; $i -lt $nomi.Count; $i++) { $ws = $wb.Worksheets.Item($i + 1); $ws.Name = $nomi[$i]; $ws.Cells.Font.Name = 'Arial'; $ws.Cells.Font.Size = 10; $FG[$nomi[$i]] = $ws }
  function M($r, $c) { New-Object 'object[,]' $r, $c }
  function Testa($ws, $indirizzo, $titoli) { $a = M 1 $titoli.Count; for ($i = 0; $i -lt $titoli.Count; $i++) { $a[0,$i] = $titoli[$i] }; $r = $ws.Range($indirizzo); $r.Value2 = $a; $r.Font.Bold = $true; $r.Font.Color = $BIANCO; $r.Interior.Color = $BLU; $r.WrapText = $true; $r.VerticalAlignment = -4108 }
  function Blocca($ws, $cella) { $ws.Activate(); $x.ActiveWindow.FreezePanes = $false; [void]$ws.Range($cella).Select(); $x.ActiveWindow.FreezePanes = $true }
  # formattazione condizionale: Excel vuole la formula nella lingua di Windows, la ricavo scrivendola in una cella
  function Locale($f) { $t = $FG['LEGGIMI'].Range('Z1'); $t.Formula = $f; $v = $t.FormulaLocal; [void]$t.ClearContents(); [string]$v }
  function Regola($ws, $zona, $formula, $sfondo, $testo, $grassetto) {
    $ws.Activate(); $r = $ws.Range($zona); [void]$r.Cells.Item(1,1).Select()
    $loc = Locale $formula
    try { $cf = $r.FormatConditions.Add(2, [Type]::Missing, $loc) } catch { throw "regola non accettata su $zona`n  inglese: $formula`n  locale:  $loc" }
    if ($sfondo) { $cf.Interior.Color = $sfondo }; if ($testo) { $cf.Font.Color = $testo }; if ($grassetto) { $cf.Font.Bold = $true }
  }
  function Esito($ws, $zona) { $p = $ws.Range($zona).Cells.Item(1,1).Address($false, $false); Regola $ws $zona "=$p=""OK""" $null 32768 $true; Regola $ws $zona "=AND($p<>"""",$p<>""OK"")" $null 255 $true }
  function Tendina($ws, $zona, $sorgente) { $v = $ws.Range($zona).Validation; $v.Delete(); $v.Add(3, 2, 1, $sorgente); $v.IgnoreBlank = $true }

  # ---------- Impostazioni ----------
  $w = $FG['Impostazioni']; Testa $w 'A1:C1' @('Voce', 'Valore', 'Spiegazione')
  $voci = @(
    @('Scuola', $DB.meta.nome, 'nome dell''istituto'), @('Anno scolastico', $DB.meta.anno, ''),
    @('Durata ora (minuti)', $DB.meta.durata, ''), @('Inizio lezioni', "'" + $DB.meta.inizio, 'ora di inizio della 1ª ora, es. 08:00'),
    @('Ore del mattino', $oreM, 'quante ore al massimo ogni mattina'), @('Ore del pomeriggio', $oreP, 'quante ore al massimo ogni pomeriggio'),
    @('Giorni', ($giorni -join ', '), 'giorni di lezione, separati da virgola'), @('Versione dati', $DB.meta.versioneDati, 'la aggiorna Orario Facile a ogni salvataggio'))
  $a = M $voci.Count 3; for ($i = 0; $i -lt $voci.Count; $i++) { for ($j = 0; $j -lt 3; $j++) { $a[$i,$j] = $voci[$i][$j] } }
  $w.Range("A2:C$($voci.Count + 1)").Value2 = $a; $w.Range("B2:B$($voci.Count + 1)").Interior.Color = $GIALLO
  $w.Columns.Item(1).ColumnWidth = 22; $w.Columns.Item(2).ColumnWidth = 40; $w.Columns.Item(3).ColumnWidth = 50

  # ---------- Vincoli ----------
  $w = $FG['Vincoli']; Testa $w 'A1:C1' @('Voce', 'Valore', 'Spiegazione')
  $spieg = @{ maxConsec = 'ore consecutive massime della stessa materia per classe'; maxConsecDoc = 'ore consecutive massime per docente'; maxOreGiorno = 'ore massime al giorno per docente'
    maxOreDiscGiorno = 'ore massime della stessa materia al giorno'; rispettaIndisp = 'rispettare le indisponibilità dei docenti (SI/NO)'; giornoLibero = 'dare il giorno libero ai docenti (SI/NO)' }
  $props = @($DB.vincoli.PSObject.Properties); $a = M $props.Count 3
  for ($i = 0; $i -lt $props.Count; $i++) { $v = $props[$i].Value; $a[$i,0] = $props[$i].Name; $a[$i,1] = $(if ($v -is [bool]) { SiNo $v } else { $v }); $a[$i,2] = $(if ($spieg[$props[$i].Name]) { $spieg[$props[$i].Name] } elseif ($props[$i].Name -like 'peso*') { 'importanza per il generatore automatico (0-10)' } else { '' }) }
  $w.Range("A2:C$($props.Count + 1)").Value2 = $a; $w.Range("B2:B$($props.Count + 1)").Interior.Color = $GIALLO
  $w.Columns.Item(1).ColumnWidth = 20; $w.Columns.Item(2).ColumnWidth = 10; $w.Columns.Item(3).ColumnWidth = 60

  # ---------- Discipline ----------
  $w = $FG['Discipline']; Testa $w 'A1:H1' @('Sigla', 'Nome', 'Ore standard', 'Principale', 'Blocchi di 2 ore', 'Modo blocchi', 'Può stare all''ultima ora', 'Colore (0-360)')
  $a = M $DB.discipline.Count 8; $i = 0
  foreach ($d in $DB.discipline) { $a[$i,0] = $d.sigla; $a[$i,1] = $d.nome; $a[$i,2] = $d.oreStd; $a[$i,3] = SiNo $d.principale; $a[$i,4] = SiNo $d.blocchi2; $a[$i,5] = $d.modoBlocchi; $a[$i,6] = SiNo $d.ultimaOra; $a[$i,7] = $d.hue; $i++ }
  $w.Range("A2:H41").Interior.Color = $GIALLO; $w.Range("A2:H$($DB.discipline.Count + 1)").Value2 = $a
  $w.Columns.Item(1).ColumnWidth = 8; $w.Columns.Item(2).ColumnWidth = 24; $w.Range('C:H').ColumnWidth = 12

  # ---------- Aule ----------
  $w = $FG['Aule']; Testa $w 'A1:C1' @('Aula', 'Tipo', 'Più classi insieme')
  $a = M $DB.aule.Count 3; $i = 0; foreach ($au in $DB.aule) { $a[$i,0] = $au.nome; $a[$i,1] = $au.tipo; $a[$i,2] = SiNo $au.contemporanea; $i++ }
  $w.Range("A2:C81").Interior.Color = $GIALLO; $w.Range("A2:C$($DB.aule.Count + 1)").Value2 = $a
  $w.Columns.Item(1).ColumnWidth = 14; $w.Columns.Item(2).ColumnWidth = 14; $w.Columns.Item(3).ColumnWidth = 16

  # ---------- Classi ----------
  # posizioni fisse: dati A..N (fino a 6 giorni x mattino/pomeriggio), totale in P
  $w = $FG['Classi']; $tit = @('Classe', 'Anno'); foreach ($g in $giorni) { $tit += "$g mattino"; $tit += "$g pomeriggio" }; while ($tit.Count -lt 14) { $tit += '' }
  $ultima = 'P'; $penultima = 'N'
  Testa $w 'A1:N1' $tit; Testa $w 'P1' @('Ore settimanali')
  $a = M $DB.classi.Count 14; $i = 0
  foreach ($c in $DB.classi) { $a[$i,0] = $c.nome; $a[$i,1] = $c.anno; $j = 2; foreach ($g in $giorni) { $a[$i,$j] = $c.g.$g.m; $a[$i,($j + 1)] = $c.g.$g.p; $j += 2 }; $i++ }
  $w.Range("A2:A$fCl").NumberFormat = '@'
  $w.Range("A2:${penultima}$fCl").Interior.Color = $GIALLO; $w.Range("A2:${penultima}$($DB.classi.Count + 1)").Value2 = $a
  $w.Range("${ultima}2:${ultima}$fCl").Formula = "=IF(A2="""","""",SUM(C2:${penultima}2))"; $w.Range("${ultima}2:${ultima}$fCl").Interior.Color = $GRIGIO
  $w.Columns.Item(1).ColumnWidth = 8; $w.Range("B:$ultima").ColumnWidth = 10

  # ---------- Quadro (classi x materie) ----------
  $w = $FG['Quadro']; $sigle = @($DB.discipline | ForEach-Object { $_.sigla })
  # posizioni fisse: classe in A, fino a 39 materie in B..AN, totale in AP
  $a = M 1 40; $a[0,0] = 'Classe'; for ($i = 0; $i -lt $sigle.Count; $i++) { $a[0, ($i + 1)] = $sigle[$i] }
  $colTot = 'AP'; $colUltSig = 'AN'
  $r = $w.Range('A1:AN1'); $r.Value2 = $a; $r.Font.Bold = $true; $r.Font.Color = $BIANCO; $r.Interior.Color = $BLU
  $r = $w.Range('AP1'); $r.Value2 = 'Totale'; $r.Font.Bold = $true; $r.Font.Color = $BIANCO; $r.Interior.Color = $BLU
  $a = M $DB.classi.Count 40; $i = 0
  foreach ($c in $DB.classi) { $a[$i,0] = $c.nome; $q = $DB.quadro.($c.id); $j = 1; foreach ($d in $DB.discipline) { $v = if ($q) { $q.($d.id) } else { $null }; if ($v) { $a[$i,$j] = $v }; $j++ }; $i++ }
  $w.Range("A2:A$fCl").NumberFormat = '@'
  $w.Range("A2:${colUltSig}$fCl").Interior.Color = $GIALLO; $w.Range("A2:${colUltSig}$($DB.classi.Count + 1)").Value2 = $a
  $w.Range("${colTot}2:${colTot}$fCl").Formula = "=IF(A2="""","""",SUM(B2:${colUltSig}2))"; $w.Range("${colTot}2:${colTot}$fCl").Interior.Color = $GRIGIO
  $w.Columns.Item(1).ColumnWidth = 8; $w.Range("B:$colTot").ColumnWidth = 6

  # ---------- Docenti ----------
  $w = $FG['Docenti']
  Testa $w 'A1:G1' @('Codice', 'Nome (vero)', 'Aule (la prima è la principale)', 'Giorno libero', 'Max ore al giorno', 'Max ore consecutive', 'Indisponibilità (es. Lunedì 1,2; Venerdì 6)')
  Testa $w 'I1:K1' @('Ore nelle cattedre', 'Ore nell''orario', 'Esito')
  $a = M $DB.docenti.Count 7; $i = 0
  foreach ($t in $DB.docenti) {
    $a[$i,0] = $t.nome
    $a[$i,2] = (@($t.aule | ForEach-Object { if ($aul[$_]) { $aul[$_].nome } }) -join ', ')
    $a[$i,3] = $t.giornoLibero; if ($t.maxGiorno) { $a[$i,4] = $t.maxGiorno }; if ($t.maxConsec) { $a[$i,5] = $t.maxConsec }
    $ind = @(); if ($t.indisp) { foreach ($p in $t.indisp.PSObject.Properties) { if (@($p.Value).Count) { $ind += $p.Name + ' ' + ((@($p.Value) | Sort-Object | ForEach-Object { if ($_ -lt $oreM) { $_ + 1 } else { 'p' + ($_ - $oreM + 1) } }) -join ',') } } }
    $a[$i,6] = $ind -join '; '
    $i++
  }
  $w.Range("A2:G$fD").Interior.Color = $GIALLO; $w.Range("A2:G$($DB.docenti.Count + 1)").Value2 = $a
  $w.Range("I2:I$fD").Formula = "=IF(A2="""","""",SUMIF(Cattedre!`$A`$2:`$A`$$fK,A2,Cattedre!`$E`$2:`$E`$$fK))"
  $w.Range("J2:J$fD").Formula = "=IF(A2="""","""",IFERROR(INDEX(Orario!`$BL`$3:`$BL`$$fO,MATCH(A2,Orario!`$A`$3:`$A`$$fO,0)),""non in Orario""))"
  $w.Range("K2:K$fD").Formula = '=IF(A2="","",IF(I2=J2,"OK",IF(ISNUMBER(J2),IF(J2<I2,"MANCANO "&(I2-J2),"TROPPE "&(J2-I2)),J2)))'
  $w.Range("I2:K$fD").Interior.Color = $GRIGIO
  $w.Columns.Item(1).ColumnWidth = 9; $w.Columns.Item(2).ColumnWidth = 24; $w.Columns.Item(3).ColumnWidth = 28; $w.Range('D:F').ColumnWidth = 11; $w.Columns.Item(7).ColumnWidth = 34
  $w.Columns.Item(8).ColumnWidth = 2; $w.Range('I:J').ColumnWidth = 11; $w.Columns.Item(11).ColumnWidth = 14

  # ---------- Cattedre ----------
  $w = $FG['Cattedre']
  Testa $w 'A1:E1' @('Codice docente', 'Nome (calcolato)', 'Classe', 'Materia (sigla)', 'Ore')
  Testa $w 'G1:I1' @('Ore messe (docente in questa classe, tutte le materie)', 'Ore previste (docente in questa classe)', 'Esito')
  $righe = @(); foreach ($t in $DB.docenti) { foreach ($k in $t.cattedre) { if ($cla[$k.cl] -and $dis[$k.di]) { $righe += , @($t.nome, $cla[$k.cl].nome, $dis[$k.di].sigla, $k.ore) } } }
  $a = M $righe.Count 1; $b = M $righe.Count 3
  for ($i = 0; $i -lt $righe.Count; $i++) { $a[$i,0] = $righe[$i][0]; $b[$i,0] = $righe[$i][1]; $b[$i,1] = $righe[$i][2]; $b[$i,2] = $righe[$i][3] }
  $w.Range("C2:D$fK").NumberFormat = '@'
  $w.Range("A2:A$fK").Interior.Color = $GIALLO; $w.Range("C2:E$fK").Interior.Color = $GIALLO
  $w.Range("A2:A$($righe.Count + 1)").Value2 = $a; $w.Range("C2:E$($righe.Count + 1)").Value2 = $b
  $w.Range("B2:B$fK").Formula = "=IF(A2="""","""",IFERROR(VLOOKUP(A2,Docenti!`$A`$2:`$B`$$fD,2,FALSE)&"""",""?""))"
  $riga = "INDEX(Orario!`$C`$3:`$BJ`$$fO,MATCH(A2,Orario!`$A`$3:`$A`$$fO,0),0)"
  $w.Range("G2:G$fK").Formula = "=IF(OR(A2="""",C2=""""),"""",IFERROR(COUNTIF($riga,C2)+COUNTIF($riga,C2&"" *"")+COUNTIF($riga,""+""&C2)+COUNTIF($riga,""+""&C2&"" *""),0))"
  $w.Range("H2:H$fK").Formula = "=IF(OR(A2="""",C2=""""),"""",SUMIFS(`$E`$2:`$E`$$fK,`$A`$2:`$A`$$fK,A2,`$C`$2:`$C`$$fK,C2))"
  $w.Range("I2:I$fK").Formula = '=IF(G2="","",IF(G2=H2,"OK",IF(G2<H2,"MANCANO "&(H2-G2),"TROPPE "&(G2-H2))))'
  $w.Range("B2:B$fK").Interior.Color = $GRIGIO; $w.Range("G2:I$fK").Interior.Color = $GRIGIO
  $w.Columns.Item(1).ColumnWidth = 10; $w.Columns.Item(2).ColumnWidth = 22; $w.Range('C:E').ColumnWidth = 9; $w.Columns.Item(6).ColumnWidth = 2; $w.Range('G:H').ColumnWidth = 14; $w.Columns.Item(9).ColumnWidth = 14
  Tendina $w "A2:A$fK" "=Docenti!`$A`$2:`$A`$$fD"; Tendina $w "C2:C$fK" "=Classi!`$A`$2:`$A`$$fCl"; Tendina $w "D2:D$fK" '=Discipline!$A$2:$A$41'

  # ---------- Orario (griglia docente x ora) ----------
  $w = $FG['Orario']; $nS = $giorni.Count * $NSL
  $w.Range('A1').Value2 = 'Codice'; $w.Range('B1').Value2 = 'Docente'
  $a = M 2 $SLOT_MAX
  for ($k = 0; $k -lt $nS; $k++) { $gi = [math]::Floor($k / $NSL); $s = $k % $NSL; if ($s -eq 0) { $a[0,$k] = $giorni[$gi] }; $a[1,$k] = Etichetta $s }
  $w.Range('C1:BJ2').Value2 = $a
  $w.Range('BL2:BN2').Value2 = [object[]]@('Ore messe', 'Ore nelle cattedre', 'Esito')
  foreach ($z in 'A1:BJ2', 'BL1:BN2') { $r = $w.Range($z); $r.Font.Bold = $true; $r.Font.Color = $BIANCO; $r.Interior.Color = $BLU; $r.WrapText = $true; $r.VerticalAlignment = -4108 }
  $a = M $DB.docenti.Count 1; $b = M $DB.docenti.Count $SLOT_MAX; $i = 0
  foreach ($t in $DB.docenti) { $a[$i,0] = $t.nome; for ($k = 0; $k -lt $nS; $k++) { if ($griglia[$t.id][$k]) { $b[$i,$k] = $griglia[$t.id][$k] } }; $i++ }
  $w.Range("A3:A$fO").NumberFormat = '@'; $w.Range("C3:BJ$fO").NumberFormat = '@'
  $w.Range("A3:A$fO").Interior.Color = $GIALLO; $w.Range("C3:BJ$fO").Interior.Color = $GIALLO
  $w.Range("A3:A$($DB.docenti.Count + 2)").Value2 = $a; $w.Range("C3:BJ$($DB.docenti.Count + 2)").Value2 = $b
  $w.Range("B3:B$fO").Formula = "=IF(A3="""","""",IFERROR(VLOOKUP(A3,Docenti!`$A`$2:`$B`$$fD,2,FALSE)&"""",""?""))"; $w.Range("B3:B$fO").Interior.Color = $GRIGIO
  $w.Range("BL3:BL$fO").Formula = '=IF(A3="","",COUNTA(C3:BJ3))'
  $w.Range("BM3:BM$fO").Formula = "=IF(A3="""","""",SUMIF(Cattedre!`$A`$2:`$A`$$fK,A3,Cattedre!`$E`$2:`$E`$$fK))"
  $w.Range("BN3:BN$fO").Formula = '=IF(A3="","",IF(BL3=BM3,"OK",IF(BL3<BM3,"MANCANO "&(BM3-BL3),"TROPPE "&(BL3-BM3))))'
  $w.Range("BL3:BN$fO").Interior.Color = $GRIGIO
  $w.Range('C3:BJ3').HorizontalAlignment = -4108; $w.Range("C3:BJ$fO").HorizontalAlignment = -4108; $w.Range("C3:BJ$fO").ShrinkToFit = $true
  $w.Columns.Item(1).ColumnWidth = 8; $w.Columns.Item(2).ColumnWidth = 20; $w.Range('C:BJ').ColumnWidth = 7.5; $w.Columns.Item(64).ColumnWidth = 2; $w.Range('BL:BM').ColumnWidth = 9; $w.Columns.Item(66).ColumnWidth = 13
  $w.Rows.Item(2).RowHeight = 28
  for ($gi = 0; $gi -lt $giorni.Count; $gi++) { $b2 = $w.Range($w.Cells.Item(1, 3 + $gi * $NSL), $w.Cells.Item($fO, 3 + $gi * $NSL)).Borders.Item(7); $b2.LineStyle = 1; $b2.Weight = -4138 }
  Tendina $w "A3:A$fO" "=Docenti!`$A`$2:`$A`$$fD"
  # colori: ROSSO = la classe ha già un altro docente in quell'ora; ARANCIONE = il docente non ha cattedre in quella classe
  $cls = 'LEFT(C3,FIND(" ",C3&" ")-1)'   # la classe è la prima parola (le celle con "+" sono escluse a parte)
  Regola $w "C3:BJ$fO" "=AND(C3<>"""",LEFT(C3,1)<>""+"",COUNTIF(C`$3:C`$$fO,$cls)+COUNTIF(C`$3:C`$$fO,$cls&"" *"")>1)" 13551615 393372 $true
  Regola $w "C3:BJ$fO" "=AND(C3<>"""",`$A3<>"""",LEFT(C3,1)<>""+"",COUNTIFS(INDIRECT(""Cattedre!A2:A$fK""),`$A3,INDIRECT(""Cattedre!C2:C$fK""),$cls)=0)" 10284031 $null $false
  Regola $w "C3:BJ$fO" "=LEFT(C3,1)=""+""" 16247773 $null $false
  Esito $w "BN3:BN$fO"; Esito $FG['Docenti'] "K2:K$fD"; Esito $FG['Cattedre'] "I2:I$fK"
  Blocca $w 'C3'

  # ---------- Vista classi (calcolata dalla griglia) ----------
  $w = $FG['Vista classi']; $r0 = 1
  $colonneGiorno = 1 + $giorni.Count
  foreach ($c in @($DB.classi) + @($null, $null, $null)) {
    $nome = if ($c) { $c.nome } else { '' }
    $w.Cells.Item($r0, 1).Value2 = 'Classe'; $w.Cells.Item($r0, 2).NumberFormat = '@'; $w.Cells.Item($r0, 2).Value2 = $nome; $w.Cells.Item($r0, 2).Interior.Color = $GIALLO
    $w.Range("A${r0}:B$r0").Font.Bold = $true; $w.Range("A${r0}:B$r0").Font.Size = 12
    $w.Cells.Item($r0, 3).Formula = "=IF(B$r0="""","""",""lezioni: ""&(COUNTIF(Orario!`$C`$3:`$BJ`$$fO,B$r0)+COUNTIF(Orario!`$C`$3:`$BJ`$$fO,B$r0&"" *""))&"" · quadro orario: ""&IFERROR(SUM(INDEX(Quadro!`$B`$2:`$${colUltSig}`$$fCl,MATCH(B$r0,Quadro!`$A`$2:`$A`$$fCl,0),0)),0))"
    $a = M 1 $colonneGiorno; $a[0,0] = 'Ora'; for ($gi = 0; $gi -lt $giorni.Count; $gi++) { $a[0, ($gi + 1)] = $giorni[$gi] }
    $ult = $w.Cells.Item(1, $colonneGiorno).Address($false, $false) -replace '\d', ''
    $rr = $w.Range("A$($r0 + 1):${ult}$($r0 + 1)"); $rr.Value2 = $a; $rr.Font.Bold = $true; $rr.Font.Color = $BIANCO; $rr.Interior.Color = $BLU
    $f = M $NSL $colonneGiorno
    for ($s = 0; $s -lt $NSL; $s++) {
      $f[$s,0] = Etichetta $s
      for ($gi = 0; $gi -lt $giorni.Count; $gi++) {
        $col = 1 + $gi * $NSL + $s
        $colonna = "INDEX(Orario!`$C`$3:`$BJ`$$fO,0,$col)"
        $pos = "IFERROR(MATCH(`$B`$$r0,$colonna,0),MATCH(`$B`$$r0&"" *"",$colonna,0))"
        $chi = "INDEX(Orario!`$A`$3:`$B`$$fO,$pos,IF(OR(INDEX(Orario!`$B`$3:`$B`$$fO,$pos)="""",INDEX(Orario!`$B`$3:`$B`$$fO,$pos)=""?""),1,2))"
        $resto = "TRIM(MID(INDEX($colonna,$pos),LEN(`$B`$$r0)+1,99))"
        $f[$s, ($gi + 1)] = "=IF(`$B`$$r0="""","""",IFERROR($chi&IF($resto<>"""","" · ""&$resto,""""),"""")&IF(COUNTIF($colonna,""+""&`$B`$$r0&""*"")>0,"" (+compresenza)"",""""))"
      }
    }
    $w.Range("A$($r0 + 2):${ult}$($r0 + 1 + $NSL)").Value2 = $f
    $w.Range("B$($r0 + 2):${ult}$($r0 + 1 + $NSL)").Interior.Color = $GRIGIO
    $r0 += $NSL + 3
  }
  $w.Columns.Item(1).ColumnWidth = 9; $w.Range('B:G').ColumnWidth = 24

  # ---------- Controlli ----------
  $w = $FG['Controlli']
  Testa $w 'A1:F1' @('Classe', 'Ore attive (Classi)', 'Quadro orario', 'Lezioni nell''orario', 'Ore con più docenti', 'Esito')
  $w.Range("A2:A$fCl").Formula = '=IF(Classi!A2="","",Classi!A2)'
  $w.Range("B2:B$fCl").Formula = "=IF(A2="""","""",Classi!${ultima}2)"
  $w.Range("C2:C$fCl").Formula = "=IF(A2="""","""",IFERROR(INDEX(Quadro!`$${colTot}`$2:`$${colTot}`$$fCl,MATCH(A2,Quadro!`$A`$2:`$A`$$fCl,0)),0))"
  $w.Range("D2:D$fCl").Formula = "=IF(A2="""","""",COUNTIF(Orario!`$C`$3:`$BJ`$$fO,A2)+COUNTIF(Orario!`$C`$3:`$BJ`$$fO,A2&"" *""))"
  $w.Range("E2:E$fCl").Formula = '=IF(A2="","",COUNTIF(I2:BP2,">1"))'
  $w.Range("F2:F$fCl").Formula = '=IF(A2="","",IF(AND(B2=C2,C2=D2,E2=0),"OK",IF(E2>0,"DOPPIONI: "&E2,IF(D2<C2,"MANCANO "&(C2-D2),IF(D2>C2,"TROPPE "&(D2-C2),"ORE ATTIVE DIVERSE DAL QUADRO")))))'
  $w.Range("A2:F$fCl").Interior.Color = $GRIGIO
  $w.Range('H1').Value2 = 'Docenti principali per classe in ogni ora (2 o più = doppione)'; $w.Range('H1').Font.Bold = $true
  $f = M $NCL $SLOT_MAX
  for ($rI = 0; $rI -lt $NCL; $rI++) { for ($k = 0; $k -lt $SLOT_MAX; $k++) { $rr = $rI + 2; $f[$rI,$k] = "=IF(`$A$rr="""","""",COUNTIF(INDEX(Orario!`$C`$3:`$BJ`$$fO,0,$($k + 1)),`$A$rr)+COUNTIF(INDEX(Orario!`$C`$3:`$BJ`$$fO,0,$($k + 1)),`$A$rr&"" *""))" } }
  $w.Range("I2:BP$fCl").Value2 = $f; $w.Range("I2:BP$fCl").Interior.Color = $GRIGIO; $w.Range('I:BP').ColumnWidth = 3
  Regola $w "I2:BP$fCl" '=AND(ISNUMBER(I2),I2>1)' 13551615 393372 $true
  Esito $w "F2:F$fCl"
  $w.Columns.Item(1).ColumnWidth = 9; $w.Range('B:E').ColumnWidth = 12; $w.Columns.Item(6).ColumnWidth = 30; $w.Columns.Item(7).ColumnWidth = 2; $w.Columns.Item(8).ColumnWidth = 2
  $w.Range('A43').Value2 = 'Riepilogo'; $w.Range('A43').Font.Bold = $true
  $rie = @(@('Classi da sistemare', "=COUNTIFS(F2:F$fCl,""<>OK"",F2:F$fCl,""?*"")"), @('Docenti da sistemare', "=COUNTIFS(Docenti!K2:K$fD,""<>OK"",Docenti!K2:K$fD,""?*"")"), @('Cattedre da sistemare', "=COUNTIFS(Cattedre!I2:I$fK,""<>OK"",Cattedre!I2:I$fK,""?*"")"))
  for ($i = 0; $i -lt $rie.Count; $i++) { $w.Cells.Item(44 + $i, 1).Value2 = $rie[$i][0]; $w.Cells.Item(44 + $i, 4).Formula = $rie[$i][1] }
  Blocca $w 'B2'
  foreach ($n in 'Docenti', 'Cattedre', 'Classi', 'Quadro', 'Discipline', 'Aule') { Blocca $FG[$n] 'B2' }

  # ---------- LEGGIMI ----------
  $w = $FG['LEGGIMI']
  $testo = @(
    'Orario – FILE DATABASE di Orario Facile (IC Almese)',
    '',
    'CHE COS''È',
    'È l''unico archivio dell''orario: Orario Facile lo carica («Carica dal Foglio») e ci salva («Salva sul Foglio»). Si può anche modificare a mano.',
    'Contiene i nomi veri dei docenti: tenerlo SOLO sul Drive della scuola, condiviso con chi prepara l''orario.',
    '',
    'COLORI',
    'GIALLO = dati (si compilano, a mano o da Orario Facile).   GRIGIO = calcolato: non scriverci.   BLU = intestazioni.',
    'Nella griglia Orario: ROSSO = la classe ha già un altro docente in quell''ora; ARANCIONE = il docente non ha cattedre in quella classe; AZZURRO = compresenza.',
    '',
    'COME SI SCRIVE UNA CELLA DELLA GRIGLIA «Orario» (una riga per docente, una colonna per ora)',
    '  1A              = classe 1A, con l''unica materia che il docente ha in quella classe, nella sua aula principale',
    '  1A STO          = classe 1A, materia STO (serve quando il docente ha più materie in quella classe)',
    '  1A ITA @MENSA   = come sopra ma in un''aula diversa da quella principale del docente',
    '  +2B SOS         = compresenza: il docente è in 2B insieme al docente titolare dell''ora (non è un doppione)',
    '  1A MAT *        = lezione bloccata: il generatore automatico di Orario Facile non la sposta',
    '',
    'SCHEDE',
    '  Impostazioni, Vincoli: dati generali e regole del generatore.      Discipline, Aule: elenchi.',
    '  Classi: ore attive per giorno (mattino/pomeriggio).                  Quadro: ore settimanali di ogni materia in ogni classe.',
    '  Docenti: codice (DOC01…), nome vero, aule (la prima è la principale), giorno libero, limiti, indisponibilità.',
    '  Cattedre: una riga per docente + classe + materia + ore.             Orario: la griglia.',
    '  Vista classi, Controlli: si calcolano da soli.',
    '',
    'REGOLE',
    '- Non spostare, aggiungere o togliere COLONNE e non rinominare le schede: Orario Facile legge le colonne in posizioni precise.',
    '- Righe: si possono aggiungere docenti, cattedre, classi nelle righe gialle libere.',
    '- Codici docenti, classi e sigle devono essere scritti sempre uguali in tutte le schede.',
    '- Il formato completo è descritto in orario-facile/DATABASE.md nel repository.'
  )
  $a = M $testo.Count 1; for ($i = 0; $i -lt $testo.Count; $i++) { $a[$i,0] = $testo[$i] }
  $w.Range("A1:A$($testo.Count)").Value2 = $a; $w.Range('A1').Font.Bold = $true; $w.Range('A1').Font.Size = 14
  foreach ($t in 'A3', 'A7', 'A11', 'A18', 'A25') { $w.Range($t).Font.Bold = $true; $w.Range($t).Font.Color = $BLU }
  $w.Range('A12:A16').Font.Name = 'Courier New'; $w.Range('A8').Interior.Color = $GIALLO; $w.Columns.Item(1).ColumnWidth = 150
  $w.Activate(); $w.Range('A1').Select()
  $x.Calculate()
  $wb.SaveAs($Uscita, 51); $wb.Close($false)
  Write-Output ("salvato: $Uscita | docenti $($DB.docenti.Count), classi $($DB.classi.Count), cattedre $($righe.Count), ore della griglia $nS" + $(if ($avvisi.Count) { ' | avvisi: ' + ($avvisi -join '; ') } else { '' }))
} finally { $x.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($x) }

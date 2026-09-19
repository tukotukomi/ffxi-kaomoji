# Generates data.js from Kaomoji_Alt_Emporium_Tracker.xlsx (sheet "Entries").
# The Kaomoji, Face Builder and Alt Code pages load data.js, so the workbook is the source of truth.
# Usage (from this folder):  powershell -ExecutionPolicy Bypass -File .\build-data.ps1
# Requires Microsoft Excel. Save the workbook first - unsaved edits are not read.
param(
  [string]$Xlsx = (Join-Path $PSScriptRoot "Kaomoji_Alt_Emporium_Tracker.xlsx"),
  [string]$Out  = (Join-Path $PSScriptRoot "data.js")
)
$ErrorActionPreference = "Stop"

$validTypes    = @("Kaomoji","Kaomoji Part","Face Builder Part","Face Builder Combo","Windows (ANSI)","Legacy (OEM)")
$validStatuses = @("Verified","Untested","Unsupported")

# ---- read the workbook (from a temp copy so an open Excel window does not block us) ----
if (-not (Test-Path $Xlsx)) { Write-Host "Workbook not found: $Xlsx"; exit 1 }
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("kae_" + [guid]::NewGuid().ToString("N") + ".xlsx")
Copy-Item $Xlsx $tmp -Force

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$vals = $null
$lastRow = 0
try {
  $wb = $excel.Workbooks.Open($tmp, $false, $true)
  $ws = $wb.Worksheets.Item("Entries")
  $lastA = $ws.Cells.Item($ws.Rows.Count, 1).End(-4162).Row
  $lastB = $ws.Cells.Item($ws.Rows.Count, 2).End(-4162).Row
  $lastRow = [Math]::Max($lastA, $lastB)
  if ($lastRow -lt 5) { throw "No entries found below the header row (row 4)." }
  $vals = $ws.Range("A5:F$lastRow").Value2
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
  [System.GC]::Collect()
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
}

function Cell($r, $c) {
  $v = $vals[$r, $c]
  if ($null -eq $v) { return "" }
  return ([string]$v).Trim()
}

function J([string]$s) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.Append('"')
  foreach ($ch in $s.ToCharArray()) {
    $code = [int]$ch
    if ($code -eq 34) { [void]$sb.Append('\"') }
    elseif ($code -eq 92) { [void]$sb.Append('\\') }
    elseif ($code -lt 32 -or $code -eq 0x2028 -or $code -eq 0x2029) { [void]$sb.Append(('\u{0:x4}' -f $code)) }
    else { [void]$sb.Append($ch) }
  }
  [void]$sb.Append('"')
  return $sb.ToString()
}

$errors   = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
$ord = [StringComparer]::Ordinal

$faces  = New-Object System.Collections.Generic.List[string]
$blocks = New-Object System.Collections.Generic.List[string]
$parts  = New-Object System.Collections.Generic.List[string]
$combos = New-Object System.Collections.Generic.List[string]
$ansi   = New-Object System.Collections.Generic.List[string]
$oem    = New-Object System.Collections.Generic.List[string]

$contentStatus = New-Object 'System.Collections.Generic.Dictionary[string,string]' $ord
$comboStatus   = New-Object 'System.Collections.Generic.Dictionary[string,string]' $ord
$codeStatus    = New-Object 'System.Collections.Generic.Dictionary[string,string]' $ord
$codeRow       = New-Object 'System.Collections.Generic.Dictionary[string,int]' $ord
$contentKeys = New-Object System.Collections.Generic.List[string]
$comboKeys   = New-Object System.Collections.Generic.List[string]
$codeKeys    = New-Object System.Collections.Generic.List[string]
$seen        = New-Object 'System.Collections.Generic.HashSet[string]' $ord
$catCase     = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([StringComparer]::OrdinalIgnoreCase)
$counts = @{}

$n = $lastRow - 4
for ($i = 1; $i -le $n; $i++) {
  $row = $i + 4
  $content = Cell $i 1
  $type    = Cell $i 2
  $status  = Cell $i 3
  $cat     = Cell $i 4
  $name    = Cell $i 5
  $alt     = Cell $i 6

  if ($content -eq "" -and $type -eq "" -and $status -eq "" -and $cat -eq "" -and $name -eq "" -and $alt -eq "") { continue }
  if ($content -eq "") { $errors.Add("Row ${row}: Content is empty."); continue }
  if ($validTypes -notcontains $type) { $errors.Add("Row ${row}: Entry Type '$type' is not one of: $($validTypes -join ', ')."); continue }
  if ($status -eq "") { $status = "Untested" }
  if ($validStatuses -notcontains $status) { $errors.Add("Row ${row}: Player Tested '$status' must be Verified, Untested or Unsupported."); continue }

  if (-not $seen.Add("$type|$content")) { $warnings.Add("Row ${row}: duplicate $type entry '$content'.") }

  $needsCat = @("Kaomoji","Face Builder Part","Face Builder Combo","Windows (ANSI)","Legacy (OEM)") -contains $type
  if ($needsCat -and $cat -eq "") { $warnings.Add("Row ${row}: no Category for '$content' (shown as Uncategorized)."); $cat = "Uncategorized" }
  if ($needsCat) {
    $group = if ($type -eq "Face Builder Part" -or $type -eq "Face Builder Combo") { "FB" } else { $type }
    $ck = "$group|$cat"
    if ($catCase.ContainsKey($ck)) {
      if ($catCase[$ck] -cne $cat) { $warnings.Add("Row ${row}: Category '$cat' differs only in capitalization from '$($catCase[$ck])' - they will show as two chips.") }
    } else { $catCase[$ck] = $cat }
  }

  $needsAlt = @("Face Builder Part","Windows (ANSI)","Legacy (OEM)") -contains $type
  $altNum = 0
  if ($needsAlt) {
    if ($alt -eq "") { $errors.Add("Row ${row}: Alt Code is required for $type."); continue }
    $ok = $false
    if ($type -eq "Windows (ANSI)") { $ok = $alt -match '^Alt\+0\d{3}$' }
    elseif ($type -eq "Legacy (OEM)") { $ok = $alt -match '^Alt\+[1-9]\d{0,2}$' }
    else { $ok = $alt -match '^Alt\+\d{1,4}$' }
    if (-not $ok) { $errors.Add("Row ${row}: Alt Code '$alt' is not valid for $type (Windows = Alt+0176 with leading zero, Legacy = Alt+193 without)."); continue }
    $altNum = [int]($alt.Substring(4))
    if ($type -ne "Face Builder Part" -and $altNum -gt 255) { $errors.Add("Row ${row}: Alt Code '$alt' is above 255."); continue }
  }

  if (-not $counts.ContainsKey($type)) { $counts[$type] = @{ Verified = 0; Untested = 0; Unsupported = 0 } }
  $counts[$type][$status]++

  switch ($type) {
    "Kaomoji" {
      $faces.Add("[" + (J $content) + "," + (J $cat) + "]")
      if ($status -ne "Untested") {
        if ($contentStatus.ContainsKey($content) -and $contentStatus[$content] -ne $status) { $warnings.Add("Row ${row}: '$content' is marked $status but another row with the same content is $($contentStatus[$content]).") }
        else { if (-not $contentStatus.ContainsKey($content)) { $contentKeys.Add($content) }; $contentStatus[$content] = $status }
      }
    }
    "Kaomoji Part" {
      $blocks.Add("[" + (J $content) + "," + (J $name) + "]")
      if ($status -ne "Untested") {
        if ($contentStatus.ContainsKey($content) -and $contentStatus[$content] -ne $status) { $warnings.Add("Row ${row}: '$content' is marked $status but another row with the same content is $($contentStatus[$content]).") }
        else { if (-not $contentStatus.ContainsKey($content)) { $contentKeys.Add($content) }; $contentStatus[$content] = $status }
      }
    }
    "Face Builder Part" {
      $parts.Add("[" + (J $content) + "," + (J $alt) + "," + (J $name) + "," + (J $cat) + "]")
    }
    "Face Builder Combo" {
      $combos.Add("[" + (J $content) + "," + (J $cat) + "]")
      if ($status -ne "Untested") {
        if ($comboStatus.ContainsKey($content) -and $comboStatus[$content] -ne $status) { $warnings.Add("Row ${row}: combo '$content' is marked $status but another row with the same content is $($comboStatus[$content]).") }
        else { if (-not $comboStatus.ContainsKey($content)) { $comboKeys.Add($content) }; $comboStatus[$content] = $status }
      }
    }
    "Windows (ANSI)" { $ansi.Add("[" + $altNum + "," + (J $content) + "," + (J $name) + "," + (J $cat) + "]") }
    "Legacy (OEM)"   { $oem.Add("[" + $altNum + "," + (J $content) + "," + (J $name) + "," + (J $cat) + "]") }
  }

  if ($needsAlt -and $status -ne "Untested") {
    if ($codeStatus.ContainsKey($alt)) {
      if ($codeStatus[$alt] -ne $status) { $warnings.Add("${alt}: row $($codeRow[$alt]) says $($codeStatus[$alt]) but row $row says $status - using row $($codeRow[$alt]).") }
    } else { $codeStatus[$alt] = $status; $codeRow[$alt] = $row; $codeKeys.Add($alt) }
  }
}

if ($errors.Count -gt 0) {
  Write-Host ""
  Write-Host "data.js was NOT written - fix these rows in the workbook first:" -ForegroundColor Red
  $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  exit 1
}

function Arr([string]$name, $items) {
  return "const $name = [`n" + ($items -join ",`n") + "`n];`n"
}
function MapText([string]$name, $keys, $dict) {
  $lines = New-Object System.Collections.Generic.List[string]
  foreach ($k in $keys) { $lines.Add((J $k) + ":" + (J $dict[$k])) }
  return "const $name = {`n" + ($lines -join ",`n") + "`n};`n"
}

$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("// GENERATED by build-data.ps1 from Kaomoji_Alt_Emporium_Tracker.xlsx (sheet `"Entries`").`n")
[void]$sb.Append("// Do not edit by hand - edit the workbook, save it, and re-run build-data.ps1.`n`n")
[void]$sb.Append((Arr "FACES" $faces)); [void]$sb.Append("`n")
[void]$sb.Append((Arr "BLOCKS" $blocks)); [void]$sb.Append("`n")
[void]$sb.Append((Arr "FACE_PARTS" $parts)); [void]$sb.Append("`n")
[void]$sb.Append((Arr "FACE_COMBOS" $combos)); [void]$sb.Append("`n")
[void]$sb.Append((Arr "ANSI_DATA" $ansi)); [void]$sb.Append("`n")
[void]$sb.Append((Arr "OEM_DATA" $oem)); [void]$sb.Append("`n")
[void]$sb.Append("// Player Tested status. Anything not listed defaults to Untested.`n")
[void]$sb.Append((MapText "CONTENT_STATUS" $contentKeys $contentStatus)); [void]$sb.Append("`n")
[void]$sb.Append((MapText "COMBO_STATUS" $comboKeys $comboStatus)); [void]$sb.Append("`n")
[void]$sb.Append((MapText "CODE_STATUS" $codeKeys $codeStatus))

[IO.File]::WriteAllText($Out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Wrote $Out"
foreach ($t in $validTypes) {
  if ($counts.ContainsKey($t)) {
    $c = $counts[$t]
    $total = $c.Verified + $c.Untested + $c.Unsupported
    Write-Host ("  {0,-20} {1,4} entries  ({2} verified, {3} unsupported, {4} untested)" -f $t, $total, $c.Verified, $c.Unsupported, $c.Untested)
  }
}
if ($warnings.Count -gt 0) {
  Write-Host ""
  Write-Host "Warnings:" -ForegroundColor Yellow
  $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

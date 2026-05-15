# Scraper pour cloturesdirectes.ca
# Extrait tous les produits avec variantes (cascade AJAX), prix, couleurs, images

$ErrorActionPreference = 'Continue'
$base = 'https://www.cloturesdirectes.ca'
$outDir = $PSScriptRoot
if (-not $outDir) { $outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission' }

Add-Type -AssemblyName System.Web

# ---------- 1. Lire la liste de produits ----------
$prodFile = Join-Path $outDir '_cd_products.txt'
if (-not (Test-Path $prodFile)) {
  Write-Host "Liste produits absente, regen..." -ForegroundColor Yellow
  $subcats = @('4/2/cloture-maille-residentielle','3/2/cloture-ornemental-residentielle','5/2/poteaux-cloture-residentielle','6/2/barriere-portes-cloture-residentielle','7/2/accessoires-cloture-residentielle','4/1/cloture-maille-commerciale','76/1/tuyaux-galvanises-commerciaux','13/1/produits-de-ferme','7/1/accessoires-clotures-commerciaux','6/1/barriere-clotures-commerciale','8/0/outils-installation-clotures')
  $all = @()
  foreach($s in $subcats){
    try { $r = Invoke-WebRequest "$base/fr/clotures-produits/$s" -UseBasicParsing
      $all += ([regex]'/fr/clotures-details/\d+/\d+/\d+/[^"\s]+').Matches($r.Content) | ForEach-Object { $_.Value }
    } catch {}
  }
  ($all | Sort-Object -Unique) | Out-File -Encoding utf8 $prodFile
}
$urls = Get-Content $prodFile | Where-Object { $_ -match '/fr/clotures-details/' }
Write-Host "Produits a traiter: $($urls.Count)" -ForegroundColor Cyan

# ---------- 2. Fonctions ----------
function Decode-Html([string]$s){
  if ($null -eq $s) { return '' }
  return [System.Web.HttpUtility]::HtmlDecode($s).Trim()
}

function Parse-Prix([string]$html){
  # "595<sup>34&nbsp;$</sup>" => 595.34
  if (-not $html) { return $null }
  $clean = ($html -replace '&nbsp;', ' ' -replace '<[^>]+>', '|').Trim('|',' ')
  if ($clean -match '(\d+)\s*\|\s*(\d+)') { return [double]"$($Matches[1]).$($Matches[2])" }
  if ($clean -match '(\d+(?:[.,]\d+)?)') { return [double]($Matches[1] -replace ',', '.') }
  return $null
}

function Post-SearchProduct {
  param($session, [string[]]$choix, [string[]]$fkIds, [string]$idGroupe, [string]$nextFk, [string]$numberoption)
  $parts = @()
  for($i=0; $i -lt $choix.Count; $i++){
    $parts += "choix%5B%5D=" + [System.Web.HttpUtility]::UrlEncode($choix[$i])
  }
  for($i=0; $i -lt $fkIds.Count; $i++){
    $parts += "fk_id_option%5B%5D=" + $fkIds[$i]
  }
  $parts += "id_groupe=$idGroupe"
  $parts += "fk_id_optionnext=$nextFk"
  $parts += "numberoption=$numberoption"
  $body = $parts -join '&'
  try {
    $r = Invoke-WebRequest "$base/fr/inc/searchproduct" -Method POST -Body $body `
      -ContentType 'application/x-www-form-urlencoded; charset=UTF-8' -WebSession $session -UseBasicParsing -TimeoutSec 30
    # Le PHP peut emettre des warnings HTML avant le JSON
    $content = $r.Content
    # Le PHP peut emettre des warnings HTML avant le JSON. Le JSON commence par {"
    $jsonStart = $content.IndexOf('{"')
    if ($jsonStart -lt 0) { return $null }
    $jsonStr = $content.Substring($jsonStart)
    return ($jsonStr | ConvertFrom-Json)
  } catch {
    Write-Host "  AJAX err: $_" -ForegroundColor DarkRed
    return $null
  }
}

function Recurse-Cascade {
  param($session, [string]$idGroupe, [int]$numberoption, [string[]]$fkOptions, [string[]]$option1Values, [string[]]$currentChoix, [int]$level, $resultsList)
  if ($level -gt $numberoption) {
    $resp = Post-SearchProduct -session $session -choix $currentChoix -fkIds $fkOptions -idGroupe $idGroupe -nextFk '0' -numberoption "$numberoption"
    if ($resp -and $resp.numero -and $resp.numero -ne '0') {
      $resultsList.Add([pscustomobject]@{
        choix = @($currentChoix)
        sku = "$($resp.numero)"
        prix = (Parse-Prix $resp.prix)
      }) | Out-Null
    }
    return
  }
  if ($level -eq 1) {
    $values = $option1Values
  } else {
    $fkArr = @($fkOptions[0..($level-2)])
    $nextFk = $fkOptions[$level-1]
    $resp = Post-SearchProduct -session $session -choix $currentChoix -fkIds $fkArr -idGroupe $idGroupe -nextFk $nextFk -numberoption "$numberoption"
    if (-not $resp -or -not $resp.selectoption -or $resp.selectoption -isnot [array] -and -not $resp.selectoption.PSObject.Properties['text']) {
      # selectoption peut etre "" ou un objet unique
      if ($resp -and $resp.selectoption -and $resp.selectoption -ne '') {
        $values = @($resp.selectoption | ForEach-Object { $_.text })
      } else { return }
    } else {
      $values = @($resp.selectoption | ForEach-Object { $_.text })
    }
  }
  foreach($v in $values){
    if ($v -eq 'choisir' -or -not $v) { continue }
    $newChoix = @($currentChoix) + $v
    Recurse-Cascade -session $session -idGroupe $idGroupe -numberoption $numberoption -fkOptions $fkOptions -option1Values $option1Values -currentChoix $newChoix -level ($level+1) -resultsList $resultsList
  }
}

function Cascade-Variants {
  param($session, [string]$idGroupe, [int]$numberoption, [string[]]$fkOptions, [string[]]$option1Values)
  $results = New-Object System.Collections.Generic.List[object]
  Recurse-Cascade -session $session -idGroupe $idGroupe -numberoption $numberoption -fkOptions $fkOptions -option1Values $option1Values -currentChoix @() -level 1 -resultsList $results
  return $results
}

function Extract-Couleurs {
  param([string]$html)
  # Retourne hashtable: numero -> @(couleur1, couleur2, ...)
  $map = @{}
  $blocks = ([regex]'(?s)<div class="infocouleur_([\w\-]+)\s*"[^>]*>(.*?)(?=<div class="infocouleur_|<script|<form|<div class="prix_)').Matches($html)
  foreach($b in $blocks){
    $numero = $b.Groups[1].Value
    $blockHtml = $b.Groups[2].Value
    $names = ([regex]'<span class="nomcouleur">([^<]+)</span>').Matches($blockHtml) | ForEach-Object { Decode-Html $_.Groups[1].Value }
    if ($names.Count -gt 0) { $map[$numero] = $names }
  }
  return $map
}

# ---------- 3. Boucle principale ----------
$rows = New-Object System.Collections.Generic.List[object]
$idx = 0
foreach($path in $urls){
  $idx++
  $url = "$base$path"
  $productId = if ($path -match 'clotures-details/(\d+)/') { $Matches[1] } else { "$idx" }
  Write-Host "[$idx/$($urls.Count)] $productId - $path" -ForegroundColor Cyan
  
  $sess = $null
  try {
    $r = Invoke-WebRequest $url -SessionVariable sess -UseBasicParsing -TimeoutSec 30
  } catch {
    Write-Host "  ERR fetch: $_" -ForegroundColor Red
    continue
  }
  $c = $r.Content
  
  # Nom du produit: d'abord JSON-LD
  $prodName = ''
  $prodImage = ''
  $prodPrice = $null
  $prodColors = ''
  if ($c -match '(?s)<script type="application/ld\+json">\s*(\{[^<]*"@type":\s*"Product"[^<]*\})\s*</script>') {
    try {
      $ld = $Matches[1] | ConvertFrom-Json
      $prodName = $ld.name
      $prodImage = $ld.image
      $prodPrice = [double]$ld.offers.price
      $prodColors = $ld.color
    } catch {}
  }
  if (-not $prodName) {
    if ($c -match '<title>([^<]+)</title>') { $prodName = (Decode-Html $Matches[1]) -replace '\s*de Clôtures directes\s*$','' }
  }
  if (-not $prodImage) {
    if ($c -match '<img[^>]+src="([^"]*produits[^"]+)"') { $prodImage = if ($Matches[1].StartsWith('http')) { $Matches[1] } else { "$base$($Matches[1])" } }
  }
  
  # Meta produit
  $idGroupe = ''
  $numberoption = 0
  $fkOptions = @()
  if ($c -match '<input[^>]+name="id_groupe"[^>]*value="([^"]+)"') { $idGroupe = $Matches[1] }
  if ($c -match '<input[^>]+name="numberoption"[^>]*value="(\d+)"') { $numberoption = [int]$Matches[1] }
  for($i=1; $i -le 10; $i++){
    if ($c -match "<input[^>]+name=`"fk_id_option$i`"[^>]*value=`"([^`"]+)`"") { $fkOptions += $Matches[1] } else { break }
  }
  
  # Noms des options (depuis labels)
  $optionNames = @()
  for($i=1; $i -le $numberoption; $i++){
    if ($c -match "(?s)<label[^>]*for=`"option$i`"[^>]*>([^<]+)</label>") {
      $optionNames += (Decode-Html $Matches[1])
    } else {
      $optionNames += "Option$i"
    }
  }
  
  # Valeurs option1 (depuis select)
  $option1Values = @()
  if ($c -match '(?s)<select[^>]+name="option1"[^>]*>(.*?)</select>') {
    $option1Values = ([regex]'<option\s+value="([^"]+)"').Matches($Matches[1]) | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -ne 'choisir' }
  }
  
  # Couleurs par SKU
  $couleurMap = Extract-Couleurs $c
  
  Write-Host "  $prodName | options=$numberoption | option1=$($option1Values.Count) | couleurs blocks=$($couleurMap.Count)" -ForegroundColor Gray
  
  # Cas 1: produit sans options (numberoption=0 ou pas de select)
  if ($numberoption -eq 0 -or $option1Values.Count -eq 0) {
    $rows.Add([pscustomobject]@{
      product_id = $productId
      product_name = $prodName
      product_url = $url
      product_image = $prodImage
      sku = ''
      option1_name = ''; option1_value = ''
      option2_name = ''; option2_value = ''
      option3_name = ''; option3_value = ''
      option4_name = ''; option4_value = ''
      prix = $prodPrice
      couleurs = $prodColors
    })
    continue
  }
  
  # Cas 2: cascade AJAX
  $variants = Cascade-Variants -session $sess -idGroupe $idGroupe -numberoption $numberoption -fkOptions $fkOptions -option1Values $option1Values
  
  if ($variants.Count -eq 0) {
    Write-Host "  Aucune variante recuperee, fallback" -ForegroundColor Yellow
    $rows.Add([pscustomobject]@{
      product_id = $productId
      product_name = $prodName
      product_url = $url
      product_image = $prodImage
      sku = ''
      option1_name = if ($optionNames.Count -ge 1) { $optionNames[0] } else { '' }
      option1_value = ''
      option2_name = if ($optionNames.Count -ge 2) { $optionNames[1] } else { '' }
      option2_value = ''
      option3_name = if ($optionNames.Count -ge 3) { $optionNames[2] } else { '' }
      option3_value = ''
      option4_name = if ($optionNames.Count -ge 4) { $optionNames[3] } else { '' }
      option4_value = ''
      prix = $prodPrice
      couleurs = $prodColors
    })
    continue
  }
  
  foreach($v in $variants){
    $couleurs = ''
    if ($couleurMap.ContainsKey($v.sku)) { $couleurs = ($couleurMap[$v.sku] -join ', ') }
    $row = [pscustomobject]@{
      product_id = $productId
      product_name = $prodName
      product_url = $url
      product_image = $prodImage
      sku = $v.sku
      option1_name = if ($optionNames.Count -ge 1) { $optionNames[0] } else { '' }
      option1_value = if ($v.choix.Count -ge 1) { $v.choix[0] } else { '' }
      option2_name = if ($optionNames.Count -ge 2) { $optionNames[1] } else { '' }
      option2_value = if ($v.choix.Count -ge 2) { $v.choix[1] } else { '' }
      option3_name = if ($optionNames.Count -ge 3) { $optionNames[2] } else { '' }
      option3_value = if ($v.choix.Count -ge 3) { $v.choix[2] } else { '' }
      option4_name = if ($optionNames.Count -ge 4) { $optionNames[3] } else { '' }
      option4_value = if ($v.choix.Count -ge 4) { $v.choix[3] } else { '' }
      prix = $v.prix
      couleurs = $couleurs
    }
    $rows.Add($row)
  }
  Write-Host "  -> $($variants.Count) variantes" -ForegroundColor Green
}

# ---------- 4. Export ----------
$csvPath = Join-Path $outDir 'produits_cd_variantes.csv'
$rows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8 -Delimiter ','
Write-Host "" 
Write-Host "TERMINE: $($rows.Count) lignes -> $csvPath" -ForegroundColor Green

# Post-processeur: re-fetch chaque page produit pour extraire
# les labels reels et les couleurs par SKU, sans refaire les AJAX.

$ErrorActionPreference = 'Continue'
$base = 'https://www.cloturesdirectes.ca'
$outDir = $PSScriptRoot
if (-not $outDir) { $outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission' }
Add-Type -AssemblyName System.Web

$csvPath = Join-Path $outDir 'produits_cd_variantes.csv'
$rows = Import-Csv $csvPath
Write-Host "Lignes: $($rows.Count)" -ForegroundColor Cyan

function Decode-Html([string]$s){
  if (-not $s) { return '' }
  return [System.Web.HttpUtility]::HtmlDecode($s).Trim()
}

# Indexer rows par product_id
$byProduct = @{}
foreach($r in $rows){
  if (-not $byProduct.ContainsKey($r.product_id)) { $byProduct[$r.product_id] = @() }
  $byProduct[$r.product_id] += $r
}

$prodIdList = $byProduct.Keys | Sort-Object
Write-Host "Produits uniques: $($prodIdList.Count)" -ForegroundColor Cyan

# Cache URL -> infos extraites (pour eviter de re-fetch un meme path)
$cache = @{}
$idx = 0
foreach($prodId in $prodIdList){
  $idx++
  $sample = $byProduct[$prodId][0]
  $url = $sample.product_url
  Write-Host "[$idx/$($prodIdList.Count)] $prodId $url" -ForegroundColor Cyan
  
  if ($cache.ContainsKey($url)) {
    $info = $cache[$url]
  } else {
    try {
      $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 30
      $c = $r.Content
    } catch {
      Write-Host "  ERR $_" -ForegroundColor Red
      continue
    }
    
    # Labels reels: <label ...>NOM</label> suivi par <select name=optionN>
    $labels = @{}
    $labelMatches = ([regex]'(?s)<label[^>]*>([^<]+)</label>\s*<select[^>]+name="(option\d+)"').Matches($c)
    foreach($m in $labelMatches){
      $name = (Decode-Html $m.Groups[1].Value)
      $opt = $m.Groups[2].Value
      $labels[$opt] = $name
    }
    
    # Description et note produit
    $description = ''
    $note = ''
    if ($c -match '(?s)<p class="description">(.*?)</p>') {
      $raw = $Matches[1] -replace '<br\s*/?>', "`n" -replace '<[^>]+>', ''
      $description = (Decode-Html $raw).Trim()
    }
    if ($c -match '(?s)<p class="note">(.*?)</p>') {
      $note = (Decode-Html ($Matches[1] -replace '<[^>]+>','')).Trim()
    }
    
    # Couleurs par SKU transforme: infocouleur_<sku-norm>
    $coulMap = @{}
    $blocks = ([regex]'(?s)<div class="infocouleur_([\w\-]+)\s*"[^>]*>(.*?)</div>\s*</div>').Matches($c)
    foreach($b in $blocks){
      $key = $b.Groups[1].Value
      $blockHtml = $b.Groups[2].Value
      $names = @(([regex]'<span class="nomcouleur">([^<]+)</span>').Matches($blockHtml) | ForEach-Object { Decode-Html $_.Groups[1].Value })
      if ($names.Count -gt 0) { $coulMap[$key] = $names }
    }
    
    $info = @{ labels = $labels; coulMap = $coulMap; description = $description; note = $note }
    $cache[$url] = $info
  }
  
  # Appliquer aux rows de ce produit
  foreach($r in $byProduct[$prodId]){
    # Labels
    if ($info.labels.ContainsKey('option1') -and $info.labels['option1']) { $r.option1_name = $info.labels['option1'] }
    if ($info.labels.ContainsKey('option2') -and $info.labels['option2']) { $r.option2_name = $info.labels['option2'] }
    if ($info.labels.ContainsKey('option3') -and $info.labels['option3']) { $r.option3_name = $info.labels['option3'] }
    if ($info.labels.ContainsKey('option4') -and $info.labels['option4']) { $r.option4_name = $info.labels['option4'] }
    # Description / note
    if (-not $r.PSObject.Properties['description']) { $r | Add-Member -NotePropertyName 'description' -NotePropertyValue $info.description }
    else { $r.description = $info.description }
    if (-not $r.PSObject.Properties['note']) { $r | Add-Member -NotePropertyName 'note' -NotePropertyValue $info.note }
    else { $r.note = $info.note }
    
    # Couleurs: transformer SKU (replace ( -> -, ) -> '', ' ' -> '')
    if ($r.sku) {
      $skuNorm = ($r.sku -replace '\(', '-' -replace '\)', '' -replace ' ', '')
      if ($info.coulMap.ContainsKey($skuNorm)) {
        $r.couleurs = ($info.coulMap[$skuNorm] -join ', ')
      }
    }
  }
}

# Reecrire CSV
$rows | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8 -Delimiter ','
Write-Host "TERMINE: CSV mis a jour" -ForegroundColor Green

# Stats
$withColors = ($rows | Where-Object { $_.couleurs }).Count
$realLabels = ($rows | Where-Object { $_.option1_name -and $_.option1_name -ne 'Option1' }).Count
Write-Host "  Lignes avec couleurs: $withColors / $($rows.Count)" -ForegroundColor Yellow
Write-Host "  Lignes avec vrai label option1: $realLabels / $($rows.Count)" -ForegroundColor Yellow


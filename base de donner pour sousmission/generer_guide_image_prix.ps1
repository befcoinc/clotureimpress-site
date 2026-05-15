$ErrorActionPreference = 'Stop'

$outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission'
$variantsPath = Join-Path $outDir 'produits_variantes_prix_photos.csv'
$photoMapPath = Join-Path $outDir 'produits_variantes_photos_relation.csv'
$guideMdPath = Join-Path $outDir 'GUIDE_PRODUITS_IMAGE_PRIX.md'
$guideHtmlPath = Join-Path $outDir 'GUIDE_PRODUITS_IMAGE_PRIX.html'

$variants = Import-Csv $variantsPath
$photos = Import-Csv $photoMapPath

$photoIndex = @{}
foreach ($p in $photos) {
  $k = if ([string]::IsNullOrWhiteSpace($p.variant_id)) { "product::$($p.product_id)" } else { "variant::$($p.variant_id)" }
  if (-not $photoIndex.ContainsKey($k)) {
    $photoIndex[$k] = $p.image_url
  }
}

$md = New-Object System.Text.StringBuilder
[void]$md.AppendLine('# Guide Produits - Image et Prix')
[void]$md.AppendLine('')
[void]$md.AppendLine('Ce guide lie chaque variante de produit avec son prix et son image correspondante.')
[void]$md.AppendLine('')
[void]$md.AppendLine('| Produit | SKU | Options | Couleur | Grandeur | Prix (CAD) | Image |')
[void]$md.AppendLine('|---|---|---|---|---|---:|---|')

foreach ($r in ($variants | Sort-Object product_name, sku)) {
  $k = if ([string]::IsNullOrWhiteSpace($r.variant_id)) { "product::$($r.product_id)" } else { "variant::$($r.variant_id)" }
  $img = $null
  if ($photoIndex.ContainsKey($k)) { $img = $photoIndex[$k] }

  $opts = @()
  if ($r.option_1_name -and $r.option_1_value) { $opts += "$($r.option_1_name): $($r.option_1_value)" }
  if ($r.option_2_name -and $r.option_2_value) { $opts += "$($r.option_2_name): $($r.option_2_value)" }
  if ($r.option_3_name -and $r.option_3_value) { $opts += "$($r.option_3_name): $($r.option_3_value)" }
  $optText = ($opts -join ' ; ')

  $imgCell = if ($img) { "![]($img)" } else { '' }
  $prix = [string]$r.selling_price

  $productName = ([string]$r.product_name).Replace('|','/').Replace('`','')
  $sku = ([string]$r.sku).Replace('|','/').Replace('`','')
  $optText = ([string]$optText).Replace('|','/').Replace('`','')
  $couleur = ([string]$r.couleur).Replace('|','/').Replace('`','')
  $grandeur = ([string]$r.grandeur).Replace('|','/').Replace('`','')

  [void]$md.AppendLine("| $productName | $sku | $optText | $couleur | $grandeur | $prix | $imgCell |")
}

$md.ToString() | Set-Content -Encoding UTF8 $guideMdPath

$rows = foreach ($r in ($variants | Sort-Object product_name, sku)) {
  $k = if ([string]::IsNullOrWhiteSpace($r.variant_id)) { "product::$($r.product_id)" } else { "variant::$($r.variant_id)" }
  $img = if ($photoIndex.ContainsKey($k)) { $photoIndex[$k] } else { '' }
  $opts = @()
  if ($r.option_1_name -and $r.option_1_value) { $opts += "$($r.option_1_name): $($r.option_1_value)" }
  if ($r.option_2_name -and $r.option_2_value) { $opts += "$($r.option_2_name): $($r.option_2_value)" }
  if ($r.option_3_name -and $r.option_3_value) { $opts += "$($r.option_3_name): $($r.option_3_value)" }
  $optText = ($opts -join ' | ')

  [pscustomobject]@{
    product_name = $r.product_name
    sku = $r.sku
    options = $optText
    couleur = $r.couleur
    grandeur = $r.grandeur
    price = $r.selling_price
    image_url = $img
    product_url = $r.product_url
  }
}

function Escape-Html([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;'))
}

$htmlSb = New-Object System.Text.StringBuilder
[void]$htmlSb.AppendLine('<!doctype html>')
[void]$htmlSb.AppendLine('<html lang="fr">')
[void]$htmlSb.AppendLine('<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
[void]$htmlSb.AppendLine('<title>Guide Produits Image Prix</title>')
[void]$htmlSb.AppendLine('<style>body{font-family:Segoe UI,Arial,sans-serif;margin:20px;background:#f5f7fb;color:#16202a} h1{margin:0 0 8px} p{margin:0 0 16px} table{width:100%;border-collapse:collapse;background:white} th,td{border:1px solid #d9e2ec;padding:8px;vertical-align:top;font-size:13px} th{background:#0ea5b7;color:white;position:sticky;top:0} img{max-width:110px;max-height:110px;object-fit:cover;border-radius:6px;border:1px solid #d9e2ec} .wrap{white-space:normal;word-break:break-word} .small{font-size:12px;color:#425466}</style></head><body>')
[void]$htmlSb.AppendLine('<h1>Guide Produits - Image et Prix</h1>')
[void]$htmlSb.AppendLine('<p class="small">Chaque ligne correspond a une variante avec son prix et une photo reliee.</p>')
[void]$htmlSb.AppendLine('<table><thead><tr><th>Image</th><th>Produit</th><th>SKU</th><th>Options</th><th>Couleur</th><th>Grandeur</th><th>Prix (CAD)</th><th>Lien</th></tr></thead><tbody>')

foreach ($row in $rows) {
  $img = Escape-Html ([string]$row.image_url)
  $name = Escape-Html ([string]$row.product_name)
  $sku = Escape-Html ([string]$row.sku)
  $opts = Escape-Html ([string]$row.options)
  $couleur = Escape-Html ([string]$row.couleur)
  $grandeur = Escape-Html ([string]$row.grandeur)
  $price = Escape-Html ([string]$row.price)
  $url = Escape-Html ([string]$row.product_url)

  $imgCell = if ([string]::IsNullOrWhiteSpace($img)) { '' } else { "<img src='$img' alt='photo produit'>" }
  $linkCell = if ([string]::IsNullOrWhiteSpace($url)) { '' } else { "<a href='$url' target='_blank'>ouvrir</a>" }

  [void]$htmlSb.AppendLine("<tr><td>$imgCell</td><td class='wrap'>$name</td><td>$sku</td><td class='wrap'>$opts</td><td>$couleur</td><td>$grandeur</td><td>$price</td><td>$linkCell</td></tr>")
}

[void]$htmlSb.AppendLine('</tbody></table></body></html>')
$htmlSb.ToString() | Set-Content -Encoding UTF8 $guideHtmlPath

Write-Host ('Guide MD: ' + $guideMdPath)
Write-Host ('Guide HTML: ' + $guideHtmlPath)
Write-Host ('Lignes guide: ' + $rows.Count)

Invoke-Item $guideHtmlPath

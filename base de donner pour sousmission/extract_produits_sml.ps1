$ErrorActionPreference = 'Stop'

$baseUrl = 'https://boutique.materiauxsml.com'
$outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission'

$categoryLinks = @(
  'https://boutique.materiauxsml.com/categories/cloture-rampe-verre/81276000000408002',
  'https://boutique.materiauxsml.com/categories/quincaillerie-cloture-rampe-verre/81276000000438010',
  'https://boutique.materiauxsml.com/categories/panneau-verre/81276000001069001',
  'https://boutique.materiauxsml.com/categories/cloture-rampe-composite/81276000000408006',
  'https://boutique.materiauxsml.com/categories/quincaillerie-cloture-rampe-composite/81276000000438044',
  'https://boutique.materiauxsml.com/categories/cabanon-composite/81276000000438048',
  'https://boutique.materiauxsml.com/categories/cloture-bois/81276000001541051'
)

function Get-NormalizedUrl([string]$u, [string]$origin) {
  if ([string]::IsNullOrWhiteSpace($u)) { return $null }
  try {
    return ([Uri]::new([Uri]$origin, $u)).AbsoluteUri
  } catch {
    return $null
  }
}

function Canonical-ProductUrl([string]$u) {
  try {
    $uri = [Uri]$u
    if ($uri.AbsolutePath -match '^/products/') {
      return "https://boutique.materiauxsml.com$($uri.AbsolutePath)"
    }
    return $u
  } catch {
    return $u
  }
}

function Get-Links([string]$html, [string]$origin) {
  $matches = [regex]::Matches($html, 'href\s*=\s*["''][^"'']+["'']', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  $links = foreach ($m in $matches) {
    $raw = $m.Value -replace '^href\s*=\s*', ''
    $raw = $raw.Trim('"', "'")
    Get-NormalizedUrl $raw $origin
  }
  return $links | Where-Object { $_ } | Select-Object -Unique
}

Write-Host ('Categories utilisees: ' + $categoryLinks.Count)

$productLinks = @()
foreach ($cat in $categoryLinks) {
  $catHtml = (Invoke-WebRequest -Uri $cat -UseBasicParsing).Content
  $links = Get-Links -html $catHtml -origin $baseUrl
  $prods = $links | Where-Object { $_ -match '/products/' }
  foreach ($p in $prods) { $productLinks += (Canonical-ProductUrl $p) }
}

$allProducts = $productLinks | Sort-Object -Unique
Write-Host ('Produits uniques trouves: ' + $allProducts.Count)

$records = New-Object 'System.Collections.Generic.List[object]'
$productSummary = New-Object 'System.Collections.Generic.List[object]'

foreach ($purl in $allProducts) {
  $html = (Invoke-WebRequest -Uri $purl -UseBasicParsing).Content
  $m = [regex]::Match($html, 'window\.zs_product\s*=\s*(\{[\s\S]*?\});')
  if (-not $m.Success) { continue }

  try {
    $product = $m.Groups[1].Value | ConvertFrom-Json -Depth 100
  } catch {
    continue
  }

  $productImages = @()
  if ($null -ne $product.images) {
    foreach ($img in $product.images) {
      $imgUrl = Get-NormalizedUrl -u $img.url -origin $baseUrl
      if ($imgUrl) { $productImages += $imgUrl }
    }
  }

  $variantCount = if ($null -ne $product.variants) { $product.variants.Count } else { 0 }

  if ($variantCount -eq 0) {
    $records.Add([pscustomobject]@{
      product_id = $product.product_id
      product_name = $product.name
      product_url = $purl
      sku = $null
      variant_id = $null
      option_1_name = $null
      option_1_value = $null
      option_2_name = $null
      option_2_value = $null
      option_3_name = $null
      option_3_value = $null
      couleur = $null
      grandeur = $null
      selling_price = $product.selling_price
      label_price = $product.label_price
      currency = 'CAD'
      is_out_of_stock = $product.is_out_of_stock
      image_urls = ($productImages -join ' | ')
    }) | Out-Null
  } else {
    foreach ($v in $product.variants) {
      $opt1n = $null; $opt1v = $null; $opt2n = $null; $opt2v = $null; $opt3n = $null; $opt3v = $null
      if ($null -ne $v.options -and $v.options.Count -ge 1) { $opt1n = $v.options[0].name; $opt1v = $v.options[0].value }
      if ($null -ne $v.options -and $v.options.Count -ge 2) { $opt2n = $v.options[1].name; $opt2v = $v.options[1].value }
      if ($null -ne $v.options -and $v.options.Count -ge 3) { $opt3n = $v.options[2].name; $opt3v = $v.options[2].value }

      $couleur = $null
      $grandeur = $null
      foreach ($o in @($v.options)) {
        if ($o.name -match '(?i)couleur|color|fini') { $couleur = $o.value }
        if ($o.name -match '(?i)grandeur|taille|dimension|size|longueur|hauteur|largeur') { $grandeur = $o.value }
      }

      $variantImages = @()
      if ($null -ne $v.images) {
        foreach ($img in $v.images) {
          $imgUrl = Get-NormalizedUrl -u $img.url -origin $baseUrl
          if ($imgUrl) { $variantImages += $imgUrl }
        }
      }
      if ($variantImages.Count -eq 0) { $variantImages = $productImages }

      $records.Add([pscustomobject]@{
        product_id = $product.product_id
        product_name = $product.name
        product_url = $purl
        sku = $v.sku
        variant_id = $v.variant_id
        option_1_name = $opt1n
        option_1_value = $opt1v
        option_2_name = $opt2n
        option_2_value = $opt2v
        option_3_name = $opt3n
        option_3_value = $opt3v
        couleur = $couleur
        grandeur = $grandeur
        selling_price = $v.selling_price
        label_price = $v.label_price
        currency = 'CAD'
        is_out_of_stock = $v.is_out_of_stock
        image_urls = ($variantImages -join ' | ')
      }) | Out-Null
    }
  }

  $productSummary.Add([pscustomobject]@{
    product_id = $product.product_id
    product_name = $product.name
    product_url = $purl
    variant_count = $variantCount
    default_price = $product.selling_price
  }) | Out-Null
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$jsonPath = Join-Path $outDir 'produits_variantes_prix_photos.json'
$csvPath = Join-Path $outDir 'produits_variantes_prix_photos.csv'
$summaryPath = Join-Path $outDir 'produits_resume.csv'

$records | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $jsonPath
$records | Export-Csv -NoTypeInformation -Encoding UTF8 $csvPath
$productSummary | Export-Csv -NoTypeInformation -Encoding UTF8 $summaryPath

Write-Host '--- TERMINE ---'
Write-Host ('Lignes variantes: ' + $records.Count)
Write-Host ('Produits resumes: ' + $productSummary.Count)
Write-Host ('JSON: ' + $jsonPath)
Write-Host ('CSV: ' + $csvPath)
Write-Host ('SUM: ' + $summaryPath)

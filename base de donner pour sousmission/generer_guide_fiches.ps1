$ErrorActionPreference = 'Stop'

$outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission'
$variantsPath = Join-Path $outDir 'produits_variantes_prix_photos.csv'
$guideHtmlPath = Join-Path $outDir 'GUIDE_PRODUITS_FICHES.html'

$variants = Import-Csv $variantsPath

# Grouper par produit pour éviter les doublons et créer une fiche par variante
$productGroups = $variants | Group-Object -Property product_id

function Escape-Html([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;'))
}

$htmlSb = New-Object System.Text.StringBuilder
[void]$htmlSb.AppendLine('<!doctype html>')
[void]$htmlSb.AppendLine('<html lang="fr">')
[void]$htmlSb.AppendLine('<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
[void]$htmlSb.AppendLine('<title>Catalogue Produits</title>')
[void]$htmlSb.AppendLine('<style>')
[void]$htmlSb.AppendLine('* { margin: 0; padding: 0; box-sizing: border-box; }')
[void]$htmlSb.AppendLine('body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f7fb; color: #16202a; }')
[void]$htmlSb.AppendLine('header { background: white; padding: 20px; border-bottom: 1px solid #d9e2ec; position: sticky; top: 0; z-index: 10; }')
[void]$htmlSb.AppendLine('h1 { font-size: 24px; margin-bottom: 8px; }')
[void]$htmlSb.AppendLine('header p { font-size: 13px; color: #425466; margin-bottom: 12px; }')
[void]$htmlSb.AppendLine('input[type="text"] { width: 100%; max-width: 500px; padding: 10px 12px; font-size: 14px; border: 1px solid #d9e2ec; border-radius: 4px; }')
[void]$htmlSb.AppendLine('input[type="text"]:focus { outline: none; border-color: #0ea5b7; box-shadow: 0 0 0 2px rgba(14,165,183,0.1); }')
[void]$htmlSb.AppendLine('.container { max-width: 1200px; margin: 0 auto; padding: 20px; }')
[void]$htmlSb.AppendLine('.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }')
[void]$htmlSb.AppendLine('.card { background: white; border-radius: 6px; overflow: hidden; border: 1px solid #d9e2ec; transition: box-shadow 0.2s; }')
[void]$htmlSb.AppendLine('.card:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }')
[void]$htmlSb.AppendLine('.card.hidden { display: none; }')
[void]$htmlSb.AppendLine('.card-image { width: 100%; height: 250px; background: #f0f3f6; display: flex; align-items: center; justify-content: center; overflow: hidden; }')
[void]$htmlSb.AppendLine('.card-image img { max-width: 100%; max-height: 100%; object-fit: cover; }')
[void]$htmlSb.AppendLine('.card-content { padding: 16px; }')
[void]$htmlSb.AppendLine('.card-name { font-size: 15px; font-weight: 500; margin-bottom: 6px; line-height: 1.3; }')
[void]$htmlSb.AppendLine('.card-sku { font-size: 12px; color: #666; margin-bottom: 8px; }')
[void]$htmlSb.AppendLine('.card-options { font-size: 12px; color: #666; margin-bottom: 10px; line-height: 1.4; }')
[void]$htmlSb.AppendLine('.card-price { font-size: 20px; font-weight: 600; color: #0ea5b7; margin: 12px 0; }')
[void]$htmlSb.AppendLine('.card-link { display: inline-block; margin-top: 8px; padding: 8px 12px; background: #0ea5b7; color: white; text-decoration: none; border-radius: 4px; font-size: 13px; font-weight: 500; }')
[void]$htmlSb.AppendLine('.card-link:hover { background: #0d8fa0; }')
[void]$htmlSb.AppendLine('.stats { margin-top: 8px; font-size: 12px; color: #666; }')
[void]$htmlSb.AppendLine('</style></head><body>')

[void]$htmlSb.AppendLine('<header>')
[void]$htmlSb.AppendLine('<h1>Catalogue Produits</h1>')
[void]$htmlSb.AppendLine('<p>Fiches produits avec images et prix correspondants</p>')
[void]$htmlSb.AppendLine('<input type="text" id="searchInput" placeholder="Chercher par nom, SKU, couleur, grandeur...">')
[void]$htmlSb.AppendLine('<p class="stats" style="margin-top: 8px;"><span id="matchCount">477</span> produits affichés</p>')
[void]$htmlSb.AppendLine('</header>')

[void]$htmlSb.AppendLine('<div class="container">')
[void]$htmlSb.AppendLine('<div class="grid" id="grid">')

# Créer une fiche par variante
foreach ($r in $variants) {
  $productName = Escape-Html ([string]$r.product_name)
  $sku = Escape-Html ([string]$r.sku)
  $price = Escape-Html ([string]$r.selling_price)
  $url = Escape-Html ([string]$r.product_url)
  $img = Escape-Html ([string]$r.image_urls)
  
  # Prendre la première image
  if ($img -match '\|') {
    $img = ($img -split '\|')[0].Trim()
  }

  $opts = @()
  if ($r.option_1_name -and $r.option_1_value) { $opts += "$(Escape-Html([string]$r.option_1_name)): $(Escape-Html([string]$r.option_1_value))" }
  if ($r.option_2_name -and $r.option_2_value) { $opts += "$(Escape-Html([string]$r.option_2_name)): $(Escape-Html([string]$r.option_2_value))" }
  if ($r.option_3_name -and $r.option_3_value) { $opts += "$(Escape-Html([string]$r.option_3_name)): $(Escape-Html([string]$r.option_3_value))" }
  
  $optText = ($opts -join '<br>')
  
  $couleur = Escape-Html ([string]$r.couleur)
  $grandeur = Escape-Html ([string]$r.grandeur)
  $searchText = "$productName $sku $optText $couleur $grandeur".ToLower()

  $imgCell = if ([string]::IsNullOrWhiteSpace($img)) { '<div style="background:#d0d0d0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#999;">Pas image</div>' } else { "<img src='$img' alt='$productName'>" }

  [void]$htmlSb.AppendLine("<div class='card' data-search='$searchText'>")
  [void]$htmlSb.AppendLine("  <div class='card-image'>$imgCell</div>")
  [void]$htmlSb.AppendLine("  <div class='card-content'>")
  [void]$htmlSb.AppendLine("    <div class='card-name'>$productName</div>")
  if ($sku) { [void]$htmlSb.AppendLine("    <div class='card-sku'>SKU: $sku</div>") }
  if ($optText) { [void]$htmlSb.AppendLine("    <div class='card-options'>$optText</div>") }
  [void]$htmlSb.AppendLine("    <div class='card-price'>\$$price CAD</div>")
  if ($url) { [void]$htmlSb.AppendLine("    <a href='$url' target='_blank' class='card-link'>Voir le produit →</a>") }
  [void]$htmlSb.AppendLine("  </div>")
  [void]$htmlSb.AppendLine("</div>")
}

[void]$htmlSb.AppendLine('</div>')
[void]$htmlSb.AppendLine('</div>')

[void]$htmlSb.AppendLine('<script>')
[void]$htmlSb.AppendLine('const searchInput = document.getElementById("searchInput");')
[void]$htmlSb.AppendLine('const grid = document.getElementById("grid");')
[void]$htmlSb.AppendLine('const matchCount = document.getElementById("matchCount");')
[void]$htmlSb.AppendLine('const cards = grid.querySelectorAll(".card");')
[void]$htmlSb.AppendLine('searchInput.addEventListener("input", function() {')
[void]$htmlSb.AppendLine('  const query = this.value.toLowerCase().trim();')
[void]$htmlSb.AppendLine('  let visible = 0;')
[void]$htmlSb.AppendLine('  cards.forEach(card => {')
[void]$htmlSb.AppendLine('    const text = card.getAttribute("data-search");')
[void]$htmlSb.AppendLine('    const matches = query === "" || text.includes(query);')
[void]$htmlSb.AppendLine('    card.classList.toggle("hidden", !matches);')
[void]$htmlSb.AppendLine('    if (matches) visible++;')
[void]$htmlSb.AppendLine('  });')
[void]$htmlSb.AppendLine('  matchCount.textContent = visible;')
[void]$htmlSb.AppendLine('});')
[void]$htmlSb.AppendLine('</script>')

[void]$htmlSb.AppendLine('</body></html>')
$htmlSb.ToString() | Set-Content -Encoding UTF8 $guideHtmlPath

Write-Host ('Guide fiches: ' + $guideHtmlPath)
Write-Host ('Fiches generees: ' + $variants.Count)

Invoke-Item $guideHtmlPath

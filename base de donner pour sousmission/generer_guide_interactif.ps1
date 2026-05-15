$ErrorActionPreference = 'Stop'

$outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission'
$variantsPath = Join-Path $outDir 'produits_variantes_prix_photos.csv'
$guideHtmlPath = Join-Path $outDir 'GUIDE_PRODUITS_INTERACTIF.html'

$variants = Import-Csv $variantsPath

# Grouper par produit
$productGroups = $variants | Group-Object -Property product_id

function Escape-Html([string]$s) {
  if ($null -eq $s) { return '' }
  return ($s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;'))
}

# Construire l'objet JSON avec tous les produits et leurs variantes
$productsData = @()
foreach ($group in $productGroups) {
  $productName = $group.Group[0].product_name
  $productId = $group.Group[0].product_id
  
  # Créer les variantes avec toutes leurs données
  $variantsArray = @()
  $allOptions = @{}
  
  foreach ($row in $group.Group) {
    $img = $row.image_urls
    if ($img -match '\|') {
      $img = ($img -split '\|')[0].Trim()
    }
    
    $opts = @{}
    $optionNames = @()
    
    if ($row.option_1_name -and $row.option_1_value) { 
      $opts[$row.option_1_name] = $row.option_1_value
      $optionNames += $row.option_1_name
      if (-not $allOptions.ContainsKey($row.option_1_name)) {
        $allOptions[$row.option_1_name] = @()
      }
      if (-not $allOptions[$row.option_1_name].Contains($row.option_1_value)) {
        $allOptions[$row.option_1_name] += $row.option_1_value
      }
    }
    
    if ($row.option_2_name -and $row.option_2_value) { 
      $opts[$row.option_2_name] = $row.option_2_value
      $optionNames += $row.option_2_name
      if (-not $allOptions.ContainsKey($row.option_2_name)) {
        $allOptions[$row.option_2_name] = @()
      }
      if (-not $allOptions[$row.option_2_name].Contains($row.option_2_value)) {
        $allOptions[$row.option_2_name] += $row.option_2_value
      }
    }
    
    if ($row.option_3_name -and $row.option_3_value) { 
      $opts[$row.option_3_name] = $row.option_3_value
      $optionNames += $row.option_3_name
      if (-not $allOptions.ContainsKey($row.option_3_name)) {
        $allOptions[$row.option_3_name] = @()
      }
      if (-not $allOptions[$row.option_3_name].Contains($row.option_3_value)) {
        $allOptions[$row.option_3_name] += $row.option_3_value
      }
    }
    
    if ($img -and $img -notmatch '/\d+x\d+$') { $img = $img + '/600x600' }
    $variantsArray += @{
      sku = $row.sku
      price = [double]::Parse(($row.selling_price -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
      image = $img
      options = $opts
    }
  }
  
  # Si pas d'options, créer une variante par défaut
  if ($variantsArray.Count -eq 0) {
    $firstRow = $group.Group[0]
    $img = $firstRow.image_urls
    if ($img -match '\|') {
      $img = ($img -split '\|')[0].Trim()
    }
    if ($img -and $img -notmatch '/\d+x\d+$') { $img = $img + '/600x600' }
    $variantsArray += @{
      sku = $firstRow.sku
      price = [double]::Parse(($firstRow.selling_price -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
      image = $img
      options = @{}
    }
  }
  
  $productsData += @{
    id = $productId
    name = $productName
    options = $allOptions
    variants = $variantsArray
  }
}

$htmlSb = New-Object System.Text.StringBuilder
[void]$htmlSb.AppendLine('<!doctype html>')
[void]$htmlSb.AppendLine('<html lang="fr">')
[void]$htmlSb.AppendLine('<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
[void]$htmlSb.AppendLine('<title>Catalogue Produits Interactif</title>')
[void]$htmlSb.AppendLine('<style>')
[void]$htmlSb.AppendLine('* { margin: 0; padding: 0; box-sizing: border-box; }')
[void]$htmlSb.AppendLine('body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f7fb; color: #16202a; }')
[void]$htmlSb.AppendLine('header { background: white; padding: 20px; border-bottom: 1px solid #d9e2ec; position: sticky; top: 0; z-index: 10; }')
[void]$htmlSb.AppendLine('h1 { font-size: 24px; margin-bottom: 8px; }')
[void]$htmlSb.AppendLine('header p { font-size: 13px; color: #425466; margin-bottom: 12px; }')
[void]$htmlSb.AppendLine('input[type="text"] { width: 100%; max-width: 500px; padding: 10px 12px; font-size: 14px; border: 1px solid #d9e2ec; border-radius: 4px; }')
[void]$htmlSb.AppendLine('input[type="text"]:focus { outline: none; border-color: #0ea5b7; box-shadow: 0 0 0 2px rgba(14,165,183,0.1); }')
[void]$htmlSb.AppendLine('.container { max-width: 1200px; margin: 0 auto; padding: 20px; }')
[void]$htmlSb.AppendLine('.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 24px; }')
[void]$htmlSb.AppendLine('.card { background: white; border-radius: 8px; overflow: hidden; border: 1px solid #d9e2ec; }')
[void]$htmlSb.AppendLine('.card.hidden { display: none; }')
[void]$htmlSb.AppendLine('.card-image { width: 100%; height: 300px; background: #f0f3f6; display: flex; align-items: center; justify-content: center; overflow: hidden; }')
[void]$htmlSb.AppendLine('.card-image img { max-width: 100%; max-height: 100%; object-fit: cover; }')
[void]$htmlSb.AppendLine('.card-content { padding: 20px; }')
[void]$htmlSb.AppendLine('.card-name { font-size: 16px; font-weight: 600; margin-bottom: 16px; }')
[void]$htmlSb.AppendLine('.option-group { margin-bottom: 16px; }')
[void]$htmlSb.AppendLine('.option-label { font-size: 13px; font-weight: 500; color: #425466; margin-bottom: 8px; display: block; }')
[void]$htmlSb.AppendLine('.option-buttons { display: flex; flex-wrap: wrap; gap: 8px; }')
[void]$htmlSb.AppendLine('button.option-btn { padding: 8px 12px; border: 2px solid #d9e2ec; background: white; color: #16202a; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.2s; }')
[void]$htmlSb.AppendLine('button.option-btn:hover { border-color: #0ea5b7; }')
[void]$htmlSb.AppendLine('button.option-btn.active { border-color: #0ea5b7; background: #0ea5b7; color: white; }')
[void]$htmlSb.AppendLine('.card-price { font-size: 28px; font-weight: 700; color: #0ea5b7; margin: 20px 0; }')
[void]$htmlSb.AppendLine('.card-sku { font-size: 12px; color: #666; margin-top: 12px; }')
[void]$htmlSb.AppendLine('.stats { margin-top: 8px; font-size: 12px; color: #666; }')
[void]$htmlSb.AppendLine('</style></head><body>')

[void]$htmlSb.AppendLine('<header>')
[void]$htmlSb.AppendLine('<h1>Catalogue Produits</h1>')
[void]$htmlSb.AppendLine('<p>Sélectionnez les options et consultez le prix correspondant</p>')
[void]$htmlSb.AppendLine('<input type="text" id="searchInput" placeholder="Chercher par nom du produit...">')
[void]$htmlSb.AppendLine('<p class="stats" style="margin-top: 8px;"><span id="matchCount">49</span> produits affichés</p>')
[void]$htmlSb.AppendLine('</header>')

[void]$htmlSb.AppendLine('<div class="container">')
[void]$htmlSb.AppendLine('<div class="grid" id="grid">')

foreach ($product in $productsData) {
  $productName = Escape-Html([string]$product.name)
  $productId = $product.id
  
  [void]$htmlSb.AppendLine("<div class='card' data-product-id='$productId' data-search='$($product.name.ToLower())'>")
  [void]$htmlSb.AppendLine("  <div class='card-image'><img src='' alt='$productName' id='img-$productId'></div>")
  [void]$htmlSb.AppendLine("  <div class='card-content'>")
  [void]$htmlSb.AppendLine("    <div class='card-name'>$productName</div>")
  
  # Générer les sélecteurs d'options
  foreach ($optionName in $product.options.Keys | Sort-Object) {
    $optionValues = $product.options[$optionName]
    [void]$htmlSb.AppendLine("    <div class='option-group'>")
    [void]$htmlSb.AppendLine("      <label class='option-label'>$(Escape-Html([string]$optionName))</label>")
    [void]$htmlSb.AppendLine("      <div class='option-buttons'>")
    foreach ($value in $optionValues) {
      $valueEscaped = Escape-Html([string]$value)
      [void]$htmlSb.AppendLine("        <button class='option-btn' data-option='$(Escape-Html([string]$optionName))' data-value='$valueEscaped'>$valueEscaped</button>")
    }
    [void]$htmlSb.AppendLine("      </div>")
    [void]$htmlSb.AppendLine("    </div>")
  }
  
  [void]$htmlSb.AppendLine("    <div class='card-price'><span id='price-$productId'>0.00</span> `$ CAD</div>")
  [void]$htmlSb.AppendLine("    <div class='card-sku'>SKU: <span id='sku-$productId'>-</span></div>")
  [void]$htmlSb.AppendLine("  </div>")
  [void]$htmlSb.AppendLine("</div>")
}

[void]$htmlSb.AppendLine('</div>')
[void]$htmlSb.AppendLine('</div>')

[void]$htmlSb.AppendLine('<script>')
[void]$htmlSb.AppendLine("const productsData = $($productsData | ConvertTo-Json -Depth 100 -AsArray);")
[void]$htmlSb.AppendLine('')
[void]$htmlSb.AppendLine('const productStates = {};')
[void]$htmlSb.AppendLine('productsData.forEach(product => {')
[void]$htmlSb.AppendLine('  productStates[product.id] = {};')
[void]$htmlSb.AppendLine('  updateProduct(product.id);')
[void]$htmlSb.AppendLine('});')
[void]$htmlSb.AppendLine('')
[void]$htmlSb.AppendLine('document.querySelectorAll(".option-btn").forEach(btn => {')
[void]$htmlSb.AppendLine('  btn.addEventListener("click", function() {')
[void]$htmlSb.AppendLine('    const option = this.getAttribute("data-option");')
[void]$htmlSb.AppendLine('    const value = this.getAttribute("data-value");')
[void]$htmlSb.AppendLine('    const card = this.closest(".card");')
[void]$htmlSb.AppendLine('    const productId = card.getAttribute("data-product-id");')
[void]$htmlSb.AppendLine('    ')
[void]$htmlSb.AppendLine('    this.parentElement.querySelectorAll(".option-btn").forEach(b => b.classList.remove("active"));')
[void]$htmlSb.AppendLine('    this.classList.add("active");')
[void]$htmlSb.AppendLine('    ')
[void]$htmlSb.AppendLine('    productStates[productId][option] = value;')
[void]$htmlSb.AppendLine('    updateProduct(productId);')
[void]$htmlSb.AppendLine('  });')
[void]$htmlSb.AppendLine('});')
[void]$htmlSb.AppendLine('')
[void]$htmlSb.AppendLine('function updateProduct(productId) {')
[void]$htmlSb.AppendLine('  const product = productsData.find(p => p.id == productId);')
[void]$htmlSb.AppendLine('  if (!product) return;')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  const state = productStates[productId];')
[void]$htmlSb.AppendLine('  const stateKeys = Object.keys(state);')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  let foundVariant = null;')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  for (const variant of product.variants) {')
[void]$htmlSb.AppendLine('    let matches = true;')
[void]$htmlSb.AppendLine('    ')
[void]$htmlSb.AppendLine('    for (const optKey of stateKeys) {')
[void]$htmlSb.AppendLine('      if (!variant.options || variant.options[optKey] !== state[optKey]) {')
[void]$htmlSb.AppendLine('        matches = false;')
[void]$htmlSb.AppendLine('        break;')
[void]$htmlSb.AppendLine('      }')
[void]$htmlSb.AppendLine('    }')
[void]$htmlSb.AppendLine('    ')
[void]$htmlSb.AppendLine('    if (matches) {')
[void]$htmlSb.AppendLine('      foundVariant = variant;')
[void]$htmlSb.AppendLine('      break;')
[void]$htmlSb.AppendLine('    }')
[void]$htmlSb.AppendLine('  }')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  if (!foundVariant && product.variants.length > 0) {')
[void]$htmlSb.AppendLine('    foundVariant = product.variants[0];')
[void]$htmlSb.AppendLine('  }')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  const priceEl = document.getElementById("price-" + productId);')
[void]$htmlSb.AppendLine('  const skuEl = document.getElementById("sku-" + productId);')
[void]$htmlSb.AppendLine('  const imgEl = document.getElementById("img-" + productId);')
[void]$htmlSb.AppendLine('  ')
[void]$htmlSb.AppendLine('  if (foundVariant) {')
[void]$htmlSb.AppendLine('    priceEl.textContent = parseFloat(foundVariant.price).toFixed(2);')
[void]$htmlSb.AppendLine('    skuEl.textContent = foundVariant.sku || "-";')
[void]$htmlSb.AppendLine('    imgEl.src = foundVariant.image || "";')
[void]$htmlSb.AppendLine('  } else {')
[void]$htmlSb.AppendLine('    priceEl.textContent = "0.00";')
[void]$htmlSb.AppendLine('    skuEl.textContent = "-";')
[void]$htmlSb.AppendLine('    imgEl.src = "";')
[void]$htmlSb.AppendLine('  }')
[void]$htmlSb.AppendLine('}')
[void]$htmlSb.AppendLine('')
[void]$htmlSb.AppendLine('const searchInput = document.getElementById("searchInput");')
[void]$htmlSb.AppendLine('const grid = document.getElementById("grid");')
[void]$htmlSb.AppendLine('const matchCount = document.getElementById("matchCount");')
[void]$htmlSb.AppendLine('const cards = grid.querySelectorAll(".card");')
[void]$htmlSb.AppendLine('')
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

Write-Host 'Guide regenere avec prix corriges'
Invoke-Item $guideHtmlPath

# Genere un guide HTML interactif pour les produits de cloturesdirectes.ca
# Base sur le modele de generer_guide_interactif.ps1

$outDir = $PSScriptRoot
if (-not $outDir) { $outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission' }

$csvPath = Join-Path $outDir 'produits_cd_variantes.csv'
$htmlOut = Join-Path $outDir 'GUIDE_CLOTURES_DIRECTES.html'

$rows = Import-Csv $csvPath
$grouped = $rows | Group-Object product_id

Write-Host "Produits: $($grouped.Count) | Variantes: $($rows.Count)" -ForegroundColor Cyan

function Parse-PrixFr([string]$s){
  if ([string]::IsNullOrWhiteSpace($s)) { return 0.0 }
  return [double]::Parse(($s -replace ',', '.'), [System.Globalization.CultureInfo]::InvariantCulture)
}

# Construire la structure produits
$productsData = @()
foreach($g in $grouped){
  $first = $g.Group[0]
  $productId = $first.product_id
  $name = $first.product_name
  $url = $first.product_url
  $img = $first.product_image
  
  # Determiner les noms d'options reels (option1_name est juste "Option1" - on garde tel quel)
  $opt1Name = $first.option1_name
  $opt2Name = $first.option2_name
  $opt3Name = $first.option3_name
  $opt4Name = $first.option4_name
  
  # Collecter valeurs uniques par option, en preservant l'ordre
  $opt1Values = @(); $opt2Values = @(); $opt3Values = @(); $opt4Values = @()
  $variants = @()
  foreach($r in $g.Group){
    if ($r.option1_value -and $opt1Values -notcontains $r.option1_value) { $opt1Values += $r.option1_value }
    if ($r.option2_value -and $opt2Values -notcontains $r.option2_value) { $opt2Values += $r.option2_value }
    if ($r.option3_value -and $opt3Values -notcontains $r.option3_value) { $opt3Values += $r.option3_value }
    if ($r.option4_value -and $opt4Values -notcontains $r.option4_value) { $opt4Values += $r.option4_value }
    
    $opts = @{}
    if ($r.option1_value) { $opts[$opt1Name] = $r.option1_value }
    if ($r.option2_value) { $opts[$opt2Name] = $r.option2_value }
    if ($r.option3_value) { $opts[$opt3Name] = $r.option3_value }
    if ($r.option4_value) { $opts[$opt4Name] = $r.option4_value }
    
    $variants += @{
      sku = $r.sku
      price = (Parse-PrixFr $r.prix)
      couleurs = $r.couleurs
      options = $opts
    }
  }
  
  $allOptions = [ordered]@{}
  if ($opt1Values.Count -gt 0) { $allOptions[$opt1Name] = $opt1Values }
  if ($opt2Values.Count -gt 0) { $allOptions[$opt2Name] = $opt2Values }
  if ($opt3Values.Count -gt 0) { $allOptions[$opt3Name] = $opt3Values }
  if ($opt4Values.Count -gt 0) { $allOptions[$opt4Name] = $opt4Values }
  
  $productsData += @{
    id = $productId
    name = $name
    url = $url
    image = $img
    description = if ($first.PSObject.Properties['description']) { $first.description } else { '' }
    note = if ($first.PSObject.Properties['note']) { $first.note } else { '' }
    options = $allOptions
    variants = $variants
  }
}

$productsJson = $productsData | ConvertTo-Json -Depth 100 -Compress

# ---------- HTML ----------
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine(@"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Guide Produits - Clotures Directes</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f5f7fa; color: #333; padding: 20px; }
.header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; text-align: center; }
.header h1 { font-size: 32px; margin-bottom: 8px; }
.header p { opacity: 0.9; }
.search-bar { background: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.search-bar input { width: 100%; padding: 14px 20px; font-size: 16px; border: 2px solid #e5e7eb; border-radius: 8px; }
.search-bar input:focus { outline: none; border-color: #3b82f6; }
.stats { color: #6b7280; margin-top: 10px; font-size: 14px; }
.products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
.product-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); padding: 20px; transition: transform 0.2s; }
.product-card:hover { transform: translateY(-4px); box-shadow: 0 8px 20px rgba(0,0,0,0.12); }
.card-image { width: 100%; height: 220px; object-fit: contain; background: #f9fafb; border-radius: 8px; margin-bottom: 15px; }
.card-name { font-size: 18px; font-weight: 600; color: #1e3a8a; margin-bottom: 12px; }
.option-group { margin-bottom: 12px; }
.option-label { font-size: 13px; font-weight: 600; color: #4b5563; margin-bottom: 6px; }
.option-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.opt-btn { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 13px; transition: all 0.15s; }
.opt-btn:hover { border-color: #3b82f6; }
.opt-btn.active { background: #3b82f6; color: white; border-color: #3b82f6; }
.card-price { font-size: 26px; font-weight: 700; color: #059669; margin: 16px 0 8px; }
.card-sku { font-size: 12px; color: #6b7280; }
.card-couleurs { font-size: 12px; color: #6b7280; margin-top: 6px; font-style: italic; }
.card-note { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; margin-top: 10px; font-size: 12px; color: #92400e; white-space: pre-line; border-radius: 0 4px 4px 0; }
.card-note strong { display: block; margin-bottom: 4px; color: #b45309; }
.no-results { text-align: center; padding: 60px; color: #6b7280; font-size: 18px; grid-column: 1 / -1; }
.card-link { display: inline-block; margin-top: 8px; font-size: 12px; color: #3b82f6; text-decoration: none; }
.card-link:hover { text-decoration: underline; }
</style>
</head>
<body>
<div class="header">
  <h1>Guide des produits - Clotures Directes</h1>
  <p>$(($grouped.Count)) produits | $(($rows.Count)) variantes</p>
</div>
<div class="search-bar">
  <input type="text" id="searchInput" placeholder="Rechercher un produit, SKU, couleur...">
  <div class="stats" id="stats"></div>
</div>
<div class="products-grid" id="productsGrid"></div>

<script>
const productsData = $productsJson;

const grid = document.getElementById('productsGrid');
const stats = document.getElementById('stats');
const searchInput = document.getElementById('searchInput');

const productStates = {};

function renderCards(filter='') {
  grid.innerHTML = '';
  const f = filter.toLowerCase().trim();
  let visible = 0;
  for (const product of productsData) {
    const searchText = (product.name + ' ' + product.id + ' ' + product.variants.map(v => v.sku + ' ' + (v.couleurs||'')).join(' ')).toLowerCase();
    if (f && !searchText.includes(f)) continue;
    visible++;
    
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;
    
    let html = '<img class="card-image" src="' + (product.image || '') + '" alt="" onerror="this.style.display=\'none\'">';
    html += '<div class="card-name">' + product.name + '</div>';
    
    const optionsObj = product.options || {};
    for (const [optName, values] of Object.entries(optionsObj)) {
      html += '<div class="option-group">';
      html += '<div class="option-label">' + optName + '</div>';
      html += '<div class="option-buttons">';
      for (const v of values) {
        html += '<button class="opt-btn" data-product="' + product.id + '" data-option="' + optName + '" data-value="' + v.replace(/"/g,'&quot;') + '">' + v + '</button>';
      }
      html += '</div></div>';
    }
    
    html += '<div class="card-price"><span id="price-' + product.id + '">--</span> $ CAD</div>';
    html += '<div class="card-sku">SKU: <span id="sku-' + product.id + '">--</span></div>';
    html += '<div class="card-couleurs" id="couleurs-' + product.id + '"></div>';
    // Notes et frais importants
    const hasNotes = (product.description && product.description.includes('***')) || product.note;
    if (hasNotes) {
      let noteText = '';
      if (product.description && product.description.includes('***')) {
        noteText += product.description.split('\n').filter(l => l.trim().startsWith('***') && l.trim().length > 3).join('\n');
      }
      if (product.note && !noteText.includes(product.note)) noteText += (noteText ? '\n' : '') + product.note;
      if (noteText) html += '<div class="card-note"><strong>⚠ Notes importantes</strong>' + noteText.replace(/</g,'&lt;') + '</div>';
    }
    html += '<a class="card-link" href="' + product.url + '" target="_blank">Voir sur cloturesdirectes.ca</a>';
    
    card.innerHTML = html;
    grid.appendChild(card);
    
    // initialize state from saved or default to first variant
    if (!productStates[product.id]) productStates[product.id] = {};
    updateProduct(product.id);
  }
  
  if (visible === 0) {
    grid.innerHTML = '<div class="no-results">Aucun produit ne correspond a votre recherche</div>';
  }
  stats.textContent = visible + ' produit(s) affiche(s)';
}

function updateProduct(productId) {
  const product = productsData.find(p => p.id === productId);
  if (!product) return;
  const state = productStates[productId];
  
  // mark active buttons
  const card = document.querySelector('.product-card[data-id="' + productId + '"]');
  if (card) {
    card.querySelectorAll('.opt-btn').forEach(b => {
      const opt = b.dataset.option;
      const val = b.dataset.value;
      b.classList.toggle('active', state[opt] === val);
    });
  }
  
  // find best matching variant
  let bestVariant = null;
  let bestScore = -1;
  for (const v of product.variants) {
    let score = 0;
    let valid = true;
    for (const [opt, val] of Object.entries(state)) {
      if (v.options[opt] === val) score++;
      else { valid = false; break; }
    }
    if (valid && score > bestScore) { bestScore = score; bestVariant = v; }
  }
  if (!bestVariant) bestVariant = product.variants[0];
  
  if (bestVariant) {
    document.getElementById('price-' + productId).textContent = bestVariant.price.toFixed(2).replace('.', ',');
    document.getElementById('sku-' + productId).textContent = bestVariant.sku || '--';
    const coulEl = document.getElementById('couleurs-' + productId);
    if (coulEl) coulEl.textContent = bestVariant.couleurs ? ('Couleurs: ' + bestVariant.couleurs) : '';
  }
}

document.addEventListener('click', function(e){
  if (e.target.classList.contains('opt-btn')) {
    const productId = e.target.dataset.product;
    const opt = e.target.dataset.option;
    const val = e.target.dataset.value;
    if (!productStates[productId]) productStates[productId] = {};
    if (productStates[productId][opt] === val) {
      delete productStates[productId][opt];
    } else {
      productStates[productId][opt] = val;
    }
    updateProduct(productId);
  }
});

let searchTimeout;
searchInput.addEventListener('input', function(){
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => renderCards(this.value), 200);
});

renderCards();
</script>
</body>
</html>
"@)

[System.IO.File]::WriteAllText($htmlOut, $sb.ToString(), [System.Text.Encoding]::UTF8)
Write-Host "Guide genere -> $htmlOut" -ForegroundColor Green

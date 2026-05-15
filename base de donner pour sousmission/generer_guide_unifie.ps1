# Genere un guide HTML unifie: Materiaux SML + Clotures Directes

$outDir = $PSScriptRoot
if (-not $outDir) { $outDir = 'C:\Users\math6\Documents\GitHub\clotureimpress-site\base de donner pour sousmission' }

$htmlOut = Join-Path $outDir 'GUIDE_UNIFIE.html'

function Parse-PrixFr([string]$s){
  if ([string]::IsNullOrWhiteSpace($s)) { return 0.0 }
  $s2 = $s -replace ',','.'
  try { return [double]::Parse($s2, [System.Globalization.CultureInfo]::InvariantCulture) } catch { return 0.0 }
}

# ============================================================
# SOURCE 1: Materiaux SML
# ============================================================
$smlRows = Import-Csv (Join-Path $outDir 'produits_variantes_prix_photos.csv')
$smlGrouped = $smlRows | Group-Object product_id
Write-Host "SML: $($smlGrouped.Count) produits / $($smlRows.Count) variantes" -ForegroundColor Cyan

$productsData = @()
foreach($g in $smlGrouped){
  $first = $g.Group[0]
  $productId = 'sml_' + $first.product_id
  
  $opt1Name = $first.option_1_name; $opt2Name = $first.option_2_name; $opt3Name = $first.option_3_name
  $opt1V=@(); $opt2V=@(); $opt3V=@()
  $variants = @()
  
  foreach($r in $g.Group){
    if ($r.option_1_value -and $opt1V -notcontains $r.option_1_value) { $opt1V += $r.option_1_value }
    if ($r.option_2_value -and $opt2V -notcontains $r.option_2_value) { $opt2V += $r.option_2_value }
    if ($r.option_3_value -and $opt3V -notcontains $r.option_3_value) { $opt3V += $r.option_3_value }
    $opts = @{}
    if ($r.option_1_value) { $opts[$opt1Name] = $r.option_1_value }
    if ($r.option_2_value) { $opts[$opt2Name] = $r.option_2_value }
    if ($r.option_3_value) { $opts[$opt3Name] = $r.option_3_value }
    $img = ($r.image_urls -split '\|')[0].Trim()
    if ($img -and $img -notmatch '/\d+x\d+$') { $img = $img + '/600x600' }
    $variants += @{
      sku = $r.sku
      price = (Parse-PrixFr $r.selling_price)
      couleurs = $r.couleur
      image = $img
      options = $opts
    }
  }
  
  $allOptions = [ordered]@{}
  if ($opt1V.Count -gt 0) { $allOptions[$opt1Name] = $opt1V }
  if ($opt2V.Count -gt 0) { $allOptions[$opt2Name] = $opt2V }
  if ($opt3V.Count -gt 0) { $allOptions[$opt3Name] = $opt3V }
  
  # image du premier variant non vide
  $mainImg = ($variants | Where-Object { $_.image } | Select-Object -First 1).image
  
  $productsData += @{
    id = $productId; source = 'SML'; sourceName = 'Matériaux SML'
    name = $first.product_name; url = $first.product_url; image = $mainImg
    description = ''; note = ''
    options = $allOptions; variants = $variants
  }
}

# ============================================================
# SOURCE 2: Clotures Directes
# ============================================================
$cdRows = Import-Csv (Join-Path $outDir 'produits_cd_variantes.csv')
$cdGrouped = $cdRows | Group-Object product_id
Write-Host "CD:  $($cdGrouped.Count) produits / $($cdRows.Count) variantes" -ForegroundColor Cyan

foreach($g in $cdGrouped){
  $first = $g.Group[0]
  $productId = 'cd_' + $first.product_id
  
  $opt1Name = $first.option1_name; $opt2Name = $first.option2_name
  $opt3Name = $first.option3_name; $opt4Name = $first.option4_name
  $opt1V=@(); $opt2V=@(); $opt3V=@(); $opt4V=@()
  $variants = @()
  
  foreach($r in $g.Group){
    if ($r.option1_value -and $opt1V -notcontains $r.option1_value) { $opt1V += $r.option1_value }
    if ($r.option2_value -and $opt2V -notcontains $r.option2_value) { $opt2V += $r.option2_value }
    if ($r.option3_value -and $opt3V -notcontains $r.option3_value) { $opt3V += $r.option3_value }
    if ($r.option4_value -and $opt4V -notcontains $r.option4_value) { $opt4V += $r.option4_value }
    $opts = @{}
    if ($r.option1_value) { $opts[$opt1Name] = $r.option1_value }
    if ($r.option2_value) { $opts[$opt2Name] = $r.option2_value }
    if ($r.option3_value) { $opts[$opt3Name] = $r.option3_value }
    if ($r.option4_value) { $opts[$opt4Name] = $r.option4_value }
    $variants += @{
      sku = $r.sku
      price = (Parse-PrixFr $r.prix)
      couleurs = $r.couleurs
      image = $r.product_image
      options = $opts
    }
  }
  
  $allOptions = [ordered]@{}
  if ($opt1V.Count -gt 0) { $allOptions[$opt1Name] = $opt1V }
  if ($opt2V.Count -gt 0) { $allOptions[$opt2Name] = $opt2V }
  if ($opt3V.Count -gt 0) { $allOptions[$opt3Name] = $opt3V }
  if ($opt4V.Count -gt 0) { $allOptions[$opt4Name] = $opt4V }
  
  $desc = ''; $note = ''
  if ($first.PSObject.Properties['description']) { $desc = $first.description }
  if ($first.PSObject.Properties['note']) { $note = $first.note }
  
  $productsData += @{
    id = $productId; source = 'CD'; sourceName = 'Clôtures Directes'
    name = $first.product_name; url = $first.product_url; image = $first.product_image
    description = $desc; note = $note
    options = $allOptions; variants = $variants
  }
}

$totalProd = $productsData.Count
$totalVar = ($smlRows.Count + $cdRows.Count)
Write-Host "TOTAL: $totalProd produits / $totalVar variantes" -ForegroundColor Green

$productsJson = $productsData | ConvertTo-Json -Depth 100 -Compress

# ============================================================
# HTML
# ============================================================
$sb = New-Object System.Text.StringBuilder
[void]$sb.AppendLine(@"
<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guide Unifié des Produits - Clôture Impress</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', Arial, sans-serif; background: #f0f2f5; color: #333; padding: 20px; }
.header { background: linear-gradient(135deg, #1e3a8a 0%, #0ea5b7 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; text-align: center; }
.header h1 { font-size: 28px; margin-bottom: 6px; }
.header p { opacity: 0.9; font-size: 15px; }
.toolbar { background: white; padding: 16px 20px; border-radius: 12px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.toolbar input { flex: 1; min-width: 200px; padding: 12px 16px; font-size: 15px; border: 2px solid #e5e7eb; border-radius: 8px; }
.toolbar input:focus { outline: none; border-color: #0ea5b7; }
.filter-btns { display: flex; gap: 8px; }
.filter-btn { padding: 10px 18px; border: 2px solid #e5e7eb; background: white; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; transition: all 0.15s; }
.filter-btn:hover { border-color: #0ea5b7; }
.filter-btn.active { background: #0ea5b7; color: white; border-color: #0ea5b7; }
.filter-btn.sml.active { background: #7c3aed; border-color: #7c3aed; }
.filter-btn.cd.active { background: #1e3a8a; border-color: #1e3a8a; }
.stats { color: #6b7280; font-size: 13px; width: 100%; }
.products-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(370px, 1fr)); gap: 20px; }
.product-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.07); padding: 20px; transition: transform 0.2s, box-shadow 0.2s; position: relative; }
.product-card:hover { transform: translateY(-4px); box-shadow: 0 10px 24px rgba(0,0,0,0.12); }
.source-badge { position: absolute; top: 12px; right: 12px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; }
.source-badge.SML { background: #ede9fe; color: #7c3aed; }
.source-badge.CD { background: #dbeafe; color: #1e3a8a; }
.card-image { width: 100%; height: 200px; object-fit: contain; background: #f9fafb; border-radius: 8px; margin-bottom: 14px; }
.card-name { font-size: 17px; font-weight: 600; color: #1e3a8a; margin-bottom: 12px; padding-right: 70px; }
.option-group { margin-bottom: 10px; }
.option-label { font-size: 12px; font-weight: 700; color: #4b5563; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 0.4px; }
.option-buttons { display: flex; flex-wrap: wrap; gap: 5px; }
.opt-btn { padding: 5px 11px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.15s; }
.opt-btn:hover { border-color: #0ea5b7; }
.opt-btn.active { background: #0ea5b7; color: white; border-color: #0ea5b7; }
.card-price { font-size: 24px; font-weight: 700; color: #059669; margin: 14px 0 6px; }
.card-sku { font-size: 12px; color: #6b7280; }
.card-couleurs { font-size: 12px; color: #6b7280; margin-top: 4px; font-style: italic; }
.card-note { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 12px; margin-top: 10px; font-size: 12px; color: #92400e; white-space: pre-line; border-radius: 0 4px 4px 0; }
.card-note strong { display: block; margin-bottom: 3px; color: #b45309; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
.card-link { display: inline-block; margin-top: 10px; font-size: 12px; color: #6b7280; text-decoration: none; }
.card-link:hover { color: #0ea5b7; text-decoration: underline; }
.no-results { text-align: center; padding: 80px; color: #6b7280; font-size: 18px; grid-column: 1 / -1; }
</style>
</head>
<body>
<div class="header">
  <h1>Guide Unifié des Produits</h1>
  <p>Matériaux SML &amp; Clôtures Directes &mdash; $totalProd produits &mdash; $totalVar variantes</p>
</div>
<div class="toolbar">
  <input type="text" id="searchInput" placeholder="Rechercher un produit, SKU, couleur...">
  <div class="filter-btns">
    <button class="filter-btn active" data-source="all">Tous</button>
    <button class="filter-btn sml" data-source="SML">Matériaux SML</button>
    <button class="filter-btn cd" data-source="CD">Clôtures Directes</button>
  </div>
  <div class="stats" id="stats"></div>
</div>
<div class="products-grid" id="productsGrid"></div>

<script>
const productsData = $productsJson;
const grid = document.getElementById('productsGrid');
const stats = document.getElementById('stats');
const searchInput = document.getElementById('searchInput');
let activeSource = 'all';
const productStates = {};

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function(){
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    activeSource = this.dataset.source;
    renderCards(searchInput.value);
  });
});

function renderCards(filter='') {
  grid.innerHTML = '';
  const f = filter.toLowerCase().trim();
  let visible = 0;
  for (const product of productsData) {
    if (activeSource !== 'all' && product.source !== activeSource) continue;
    const searchText = (product.name + ' ' + product.id + ' ' + (product.description||'') + ' ' + product.variants.map(v => v.sku + ' ' + (v.couleurs||'')).join(' ')).toLowerCase();
    if (f && !searchText.includes(f)) continue;
    visible++;
    
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.id = product.id;
    
    let html = '<span class="source-badge ' + product.source + '">' + product.sourceName + '</span>';
    html += '<img class="card-image" src="' + (product.image || '') + '" alt="" onerror="this.style.display=\'none\'">';
    html += '<div class="card-name">' + product.name + '</div>';
    
    for (const [optName, values] of Object.entries(product.options || {})) {
      if (!optName || !values || values.length === 0) continue;
      html += '<div class="option-group">';
      html += '<div class="option-label">' + optName + '</div>';
      html += '<div class="option-buttons">';
      for (const v of values) {
        html += '<button class="opt-btn" data-product="' + product.id + '" data-option="' + optName.replace(/"/g,'&quot;') + '" data-value="' + String(v).replace(/"/g,'&quot;') + '">' + v + '</button>';
      }
      html += '</div></div>';
    }
    
    html += '<div class="card-price"><span id="price-' + product.id + '">--</span> $ CAD</div>';
    html += '<div class="card-sku">SKU: <span id="sku-' + product.id + '">--</span></div>';
    html += '<div class="card-couleurs" id="couleurs-' + product.id + '"></div>';
    
    const hasNotes = (product.description && product.description.includes('***')) || product.note;
    if (hasNotes) {
      let noteText = '';
      if (product.description && product.description.includes('***')) {
        noteText += product.description.split('\n').filter(l => l.trim().startsWith('***') && l.trim().length > 3).join('\n');
      }
      if (product.note && !noteText.includes(product.note)) noteText += (noteText ? '\n' : '') + product.note;
      if (noteText) html += '<div class="card-note"><strong>&#9888; Notes importantes</strong>' + noteText.replace(/</g,'&lt;') + '</div>';
    }
    
    html += '<a class="card-link" href="' + product.url + '" target="_blank">&#8599; Voir sur le site fournisseur</a>';
    
    card.innerHTML = html;
    grid.appendChild(card);
    if (!productStates[product.id]) productStates[product.id] = {};
    updateProduct(product.id);
  }
  
  if (visible === 0) grid.innerHTML = '<div class="no-results">Aucun produit ne correspond</div>';
  const smlCount = productsData.filter(p => p.source === 'SML').length;
  const cdCount = productsData.filter(p => p.source === 'CD').length;
  stats.textContent = visible + ' produit(s) affiché(s) — SML: ' + smlCount + ' | Clôtures Directes: ' + cdCount;
}

function updateProduct(productId) {
  const product = productsData.find(p => p.id === productId);
  if (!product) return;
  const state = productStates[productId];
  const card = document.querySelector('.product-card[data-id="' + productId + '"]');
  if (card) {
    card.querySelectorAll('.opt-btn').forEach(b => {
      b.classList.toggle('active', state[b.dataset.option] === b.dataset.value);
    });
  }
  let bestVariant = null; let bestScore = -1;
  for (const v of product.variants) {
    let score = 0; let valid = true;
    for (const [opt, val] of Object.entries(state)) {
      if (v.options[opt] === val) score++;
      else { valid = false; break; }
    }
    if (valid && score > bestScore) { bestScore = score; bestVariant = v; }
  }
  if (!bestVariant) bestVariant = product.variants[0];
  if (bestVariant) {
    const priceEl = document.getElementById('price-' + productId);
    const skuEl = document.getElementById('sku-' + productId);
    const coulEl = document.getElementById('couleurs-' + productId);
    if (priceEl) priceEl.textContent = bestVariant.price > 0 ? bestVariant.price.toFixed(2).replace('.', ',') : '--';
    if (skuEl) skuEl.textContent = bestVariant.sku || '--';
    if (coulEl) coulEl.textContent = bestVariant.couleurs ? ('Couleurs: ' + bestVariant.couleurs) : '';
    // Changer image si variante en a une
    if (bestVariant.image && card) {
      const img = card.querySelector('.card-image');
      if (img && bestVariant.image !== img.src) { img.style.display = ''; img.src = bestVariant.image; }
    }
  }
}

document.addEventListener('click', function(e){
  if (e.target.classList.contains('opt-btn')) {
    const productId = e.target.dataset.product;
    const opt = e.target.dataset.option;
    const val = e.target.dataset.value;
    if (!productStates[productId]) productStates[productId] = {};
    if (productStates[productId][opt] === val) delete productStates[productId][opt];
    else productStates[productId][opt] = val;
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
Write-Host "Guide unifie genere -> $htmlOut" -ForegroundColor Green

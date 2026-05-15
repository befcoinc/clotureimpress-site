$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$cdFile = 'produits_cd_variantes.csv'
$smlVariantFile = 'produits_variantes_prix_photos.csv'
$smlRelationFile = 'produits_variantes_photos_relation.csv'
$resumeFile = 'produits_resume.csv'

if (-not (Test-Path $cdFile)) { throw "Fichier manquant: $cdFile" }
if (-not (Test-Path $smlVariantFile)) { throw "Fichier manquant: $smlVariantFile" }
if (-not (Test-Path $smlRelationFile)) { throw "Fichier manquant: $smlRelationFile" }
if (-not (Test-Path $resumeFile)) { throw "Fichier manquant: $resumeFile" }

function ConvertTo-NormalizedText([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return '' }
    return ($value -replace '\s+', ' ').Trim()
}

function ConvertTo-DecimalNumber([string]$value) {
    if ([string]::IsNullOrWhiteSpace($value)) { return $null }
    $v = $value.Trim()
    $v = $v -replace '\$', ''
    $v = $v -replace ' ', ''
    $v = $v -replace ',', '.'
    [decimal]$n = 0
    if ([decimal]::TryParse($v, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)) {
        return [math]::Round($n, 2)
    }
    return $null
}

function Merge-UrlLists([string[]]$lists) {
    $all = New-Object System.Collections.Generic.List[string]
    foreach ($item in $lists) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        $parts = $item -split '\s*\|\s*'
        foreach ($p in $parts) {
            $u = $p.Trim()
            if ([string]::IsNullOrWhiteSpace($u)) { continue }
            if ($all -notcontains $u) { [void]$all.Add($u) }
        }
    }
    return ($all -join ' | ')
}

$resumeRows = Import-Csv $resumeFile
$defaultPriceByProduct = @{}
foreach ($r in $resumeRows) {
    $productIdKey = ConvertTo-NormalizedText $r.product_id
    if ([string]::IsNullOrWhiteSpace($productIdKey)) { continue }
    $dp = ConvertTo-DecimalNumber $r.default_price
    if ($null -ne $dp) {
        $defaultPriceByProduct[$productIdKey] = $dp
    }
}

# Build image relation maps from SML image relation file.
$relationRows = Import-Csv $smlRelationFile
$imagesByVariantId = @{}
$imagesBySku = @{}
foreach ($r in $relationRows) {
    $variantId = ConvertTo-NormalizedText $r.variant_id
    $sku = ConvertTo-NormalizedText $r.sku
    $url = ConvertTo-NormalizedText $r.image_url
    if ([string]::IsNullOrWhiteSpace($url)) { continue }

    if (-not [string]::IsNullOrWhiteSpace($variantId)) {
        if (-not $imagesByVariantId.ContainsKey($variantId)) {
            $imagesByVariantId[$variantId] = New-Object System.Collections.Generic.List[string]
        }
        if ($imagesByVariantId[$variantId] -notcontains $url) { [void]$imagesByVariantId[$variantId].Add($url) }
    }
    if (-not [string]::IsNullOrWhiteSpace($sku)) {
        if (-not $imagesBySku.ContainsKey($sku)) {
            $imagesBySku[$sku] = New-Object System.Collections.Generic.List[string]
        }
        if ($imagesBySku[$sku] -notcontains $url) { [void]$imagesBySku[$sku].Add($url) }
    }
}

$records = New-Object System.Collections.Generic.List[object]

# Load SML variants.
$smlRows = Import-Csv $smlVariantFile
foreach ($r in $smlRows) {
    $variantId = ConvertTo-NormalizedText $r.variant_id
    $sku = ConvertTo-NormalizedText $r.sku
    $productId = ConvertTo-NormalizedText $r.product_id

    $inlineImages = ConvertTo-NormalizedText $r.image_urls
    $mapImages1 = if ($imagesByVariantId.ContainsKey($variantId)) { $imagesByVariantId[$variantId] -join ' | ' } else { '' }
    $mapImages2 = if ($imagesBySku.ContainsKey($sku)) { $imagesBySku[$sku] -join ' | ' } else { '' }
    $allImages = Merge-UrlLists @($inlineImages, $mapImages1, $mapImages2)

    $price = ConvertTo-DecimalNumber $r.selling_price
    $optionPairs = @(
        @{ Name = ConvertTo-NormalizedText $r.option_1_name; Value = ConvertTo-NormalizedText $r.option_1_value },
        @{ Name = ConvertTo-NormalizedText $r.option_2_name; Value = ConvertTo-NormalizedText $r.option_2_value },
        @{ Name = ConvertTo-NormalizedText $r.option_3_name; Value = ConvertTo-NormalizedText $r.option_3_value }
    )

    $variantKey = if (-not [string]::IsNullOrWhiteSpace($variantId)) { "sml::$variantId" } elseif (-not [string]::IsNullOrWhiteSpace($sku)) { "sml::sku::$sku" } else { "sml::prod::$productId::" + [guid]::NewGuid().ToString('N') }

    $records.Add([pscustomobject]@{
        source = 'SML'
        source_file = $smlVariantFile
        product_id = $productId
        product_name = ConvertTo-NormalizedText $r.product_name
        product_url = ConvertTo-NormalizedText $r.product_url
        variant_id = $variantId
        variant_key = $variantKey
        sku = $sku
        price = if ($null -eq $price) { '' } else { $price }
        currency = if ([string]::IsNullOrWhiteSpace($r.currency)) { 'CAD' } else { ConvertTo-NormalizedText $r.currency }
        option1_name = $optionPairs[0].Name
        option1_value = $optionPairs[0].Value
        option2_name = $optionPairs[1].Name
        option2_value = $optionPairs[1].Value
        option3_name = $optionPairs[2].Name
        option3_value = $optionPairs[2].Value
        option4_name = 'Couleur'
        option4_value = ConvertTo-NormalizedText $r.couleur
        taille = ConvertTo-NormalizedText $r.grandeur
        couleurs = ConvertTo-NormalizedText $r.couleur
        image_urls = $allImages
        main_image = if ([string]::IsNullOrWhiteSpace($allImages)) { '' } else { ($allImages -split '\s*\|\s*')[0] }
        stock_status = if ((ConvertTo-NormalizedText $r.is_out_of_stock).ToLowerInvariant() -eq 'true') { 'OUT_OF_STOCK' } else { 'IN_STOCK_OR_UNKNOWN' }
        description = ''
        note = ''
    })
}

# Load Clotures Directes variants and fix missing values where possible.
$cdRows = Import-Csv $cdFile

$nameByProduct = @{}
foreach ($r in $cdRows) {
    $productIdKey = ConvertTo-NormalizedText $r.product_id
    $name = ConvertTo-NormalizedText $r.product_name
    if (-not [string]::IsNullOrWhiteSpace($productIdKey) -and -not [string]::IsNullOrWhiteSpace($name) -and -not $nameByProduct.ContainsKey($productIdKey)) {
        $nameByProduct[$productIdKey] = $name
    }
}

$skuCounter = 0
foreach ($r in $cdRows) {
    $productIdKey = ConvertTo-NormalizedText $r.product_id
    $pname = ConvertTo-NormalizedText $r.product_name
    if ([string]::IsNullOrWhiteSpace($pname) -and $nameByProduct.ContainsKey($productIdKey)) { $pname = $nameByProduct[$productIdKey] }

    $sku = ConvertTo-NormalizedText $r.sku
    if ([string]::IsNullOrWhiteSpace($sku)) {
        $skuCounter += 1
        $sig = @(
            ConvertTo-NormalizedText $r.option1_value,
            ConvertTo-NormalizedText $r.option2_value,
            ConvertTo-NormalizedText $r.option3_value,
            ConvertTo-NormalizedText $r.option4_value
        ) -join '-'
        if ([string]::IsNullOrWhiteSpace($sig)) { $sig = "IDX$skuCounter" }
        $sku = "CD-$productIdKey-$sig"
    }

    $price = ConvertTo-DecimalNumber $r.prix
    if ($null -eq $price -and $defaultPriceByProduct.ContainsKey($productIdKey)) {
        $price = $defaultPriceByProduct[$productIdKey]
    }

    $image = ConvertTo-NormalizedText $r.product_image
    if ($image -like '*aucune-photo*') { $image = '' }

    $variantKey = "cd::$productIdKey::$sku"

    $records.Add([pscustomobject]@{
        source = 'CLOTURES_DIRECTES'
        source_file = $cdFile
        product_id = $productIdKey
        product_name = $pname
        product_url = ConvertTo-NormalizedText $r.product_url
        variant_id = ''
        variant_key = $variantKey
        sku = $sku
        price = if ($null -eq $price) { '' } else { $price }
        currency = 'CAD'
        option1_name = ConvertTo-NormalizedText $r.option1_name
        option1_value = ConvertTo-NormalizedText $r.option1_value
        option2_name = ConvertTo-NormalizedText $r.option2_name
        option2_value = ConvertTo-NormalizedText $r.option2_value
        option3_name = ConvertTo-NormalizedText $r.option3_name
        option3_value = ConvertTo-NormalizedText $r.option3_value
        option4_name = ConvertTo-NormalizedText $r.option4_name
        option4_value = ConvertTo-NormalizedText $r.option4_value
        taille = ''
        couleurs = ConvertTo-NormalizedText $r.couleurs
        image_urls = $image
        main_image = $image
        stock_status = 'IN_STOCK_OR_UNKNOWN'
        description = ConvertTo-NormalizedText $r.description
        note = ConvertTo-NormalizedText $r.note
    })
}

# Deduplicate by source + variant_key while preferring rows with richer images and names.
$byKey = @{}
foreach ($rec in $records) {
    $key = "$($rec.source)||$($rec.variant_key)"
    if (-not $byKey.ContainsKey($key)) {
        $byKey[$key] = $rec
        continue
    }
    $existing = $byKey[$key]

    $existingScore = 0
    if (-not [string]::IsNullOrWhiteSpace($existing.product_name)) { $existingScore += 1 }
    if (-not [string]::IsNullOrWhiteSpace($existing.price)) { $existingScore += 1 }
    if (-not [string]::IsNullOrWhiteSpace($existing.image_urls)) { $existingScore += 1 }

    $candidateScore = 0
    if (-not [string]::IsNullOrWhiteSpace($rec.product_name)) { $candidateScore += 1 }
    if (-not [string]::IsNullOrWhiteSpace($rec.price)) { $candidateScore += 1 }
    if (-not [string]::IsNullOrWhiteSpace($rec.image_urls)) { $candidateScore += 1 }

    if ($candidateScore -gt $existingScore) { $byKey[$key] = $rec }
}

$final = $byKey.Values | Sort-Object source, product_id, sku

$outCsv = 'base_unifiee_solide.csv'
$outJson = 'base_unifiee_solide.json'
$outReport = 'base_unifiee_solide_rapport.txt'

$final | Export-Csv -Path $outCsv -NoTypeInformation -Encoding UTF8
$final | ConvertTo-Json -Depth 6 | Set-Content -Path $outJson -Encoding UTF8

$missingName = ($final | Where-Object { [string]::IsNullOrWhiteSpace($_.product_name) }).Count
$missingSku = ($final | Where-Object { [string]::IsNullOrWhiteSpace($_.sku) }).Count
$missingPrice = ($final | Where-Object { [string]::IsNullOrWhiteSpace($_.price) }).Count
$missingImage = ($final | Where-Object { [string]::IsNullOrWhiteSpace($_.main_image) }).Count

$srcCounts = $final | Group-Object source | Sort-Object Name

$report = New-Object System.Collections.Generic.List[string]
$report.Add("BASE UNIFIEE SOLIDE")
$report.Add("Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$report.Add("Total lignes: $($final.Count)")
foreach ($g in $srcCounts) {
    $report.Add("Source $($g.Name): $($g.Count)")
}
$report.Add("")
$report.Add("Qualite")
$report.Add("- product_name manquant: $missingName")
$report.Add("- sku manquant: $missingSku")
$report.Add("- price manquant: $missingPrice")
$report.Add("- main_image manquante: $missingImage")
$report.Add("")
$report.Add("Fichiers generes")
$report.Add("- $outCsv")
$report.Add("- $outJson")
$report.Add("- $outReport")

$report | Set-Content -Path $outReport -Encoding UTF8

Write-Output "OK: $outCsv"
Write-Output "OK: $outJson"
Write-Output "OK: $outReport"
Write-Output "ROWS: $($final.Count)"

# Verifica que en el repositorio público solo haya modelos CIFRADOS y ningún dato de ingeniería en claro.
# Reglas:
#   - models/ solo admite .gitkeep y <id>.enc.json con exactamente las claves v, kdf, iter, alg, sal, iv, datos
#     (AES-256-GCM, PBKDF2-SHA256, iter >= 600000).
#   - No se versionan .e2k, .edb, .xlsx, .xls ni .csv fuera de tests/fixtures (datos sintéticos de prueba).
# Uso: pwsh .github/scripts/verificar-modelos.ps1
param([string]$Raiz = '.')
$ErrorActionPreference = 'Stop'
Set-Location $Raiz

$errores = New-Object System.Collections.Generic.List[string]
$esperadas = @('alg', 'datos', 'iter', 'iv', 'kdf', 'sal', 'v')

foreach ($f in @(git ls-files) | Where-Object { $_ }) {
    if ($f -match '\.(e2k|edb|xlsx|xls|csv)$' -and $f -notmatch '^tests/fixtures/') {
        $errores.Add("${f}: dato de ingeniería en claro; solo se permite en tests/fixtures (datos sintéticos).")
        continue
    }
    if ($f -notlike 'models/*' -or $f -eq 'models/.gitkeep') { continue }
    if ($f -notmatch '^models/[A-Za-z0-9_-]{4,64}\.enc\.json$') {
        $errores.Add("${f}: en models/ solo se permiten archivos <id>.enc.json.")
        continue
    }
    try {
        $j = Get-Content -Raw -Encoding UTF8 -LiteralPath $f | ConvertFrom-Json
    } catch {
        $errores.Add("${f}: no es JSON válido.")
        continue
    }
    $claves = @($j.PSObject.Properties.Name | Sort-Object)
    if ($claves.Count -ne $esperadas.Count -or (Compare-Object $claves $esperadas)) {
        $errores.Add("${f}: debe tener exactamente las claves $($esperadas -join ', ') (tiene: $($claves -join ', ')).")
        continue
    }
    if ($j.v -ne 1 -or $j.alg -ne 'AES-256-GCM' -or $j.kdf -ne 'PBKDF2-SHA256' -or [int]$j.iter -lt 600000) {
        $errores.Add("${f}: parámetros de cifrado no permitidos (se exige AES-256-GCM, PBKDF2-SHA256, iter >= 600000).")
    }
}

if ($errores.Count -gt 0) {
    $errores | ForEach-Object { Write-Host "ERROR: $_" }
    exit 1
}
Write-Host 'Verificación de modelos: sin problemas.'

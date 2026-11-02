# Escaneo de seguridad para CI: secretos en archivos versionados y binarios no permitidos.
# Mismos patrones que el hook guard-files del harness. Uso: pwsh .github/scripts/scan-secretos.ps1
# Los binarios permitidos explícitamente se listan (uno por ruta) en .harness-allow-binarios.
param([string]$Raiz = '.')
$ErrorActionPreference = 'Stop'
Set-Location $Raiz

$archivos = @(git ls-files) | Where-Object { $_ }
$permitidos = @()
if (Test-Path '.harness-allow-binarios') { $permitidos = @(Get-Content '.harness-allow-binarios' | Where-Object { $_ -and $_ -notmatch '^\s*#' }) }

$extBinariosProhibidos = '\.(xlsm|xlsb|rvt|rfa|rte|edb|pfx|p12|pem|key)$'
$extNoTexto = '\.(png|jpe?g|gif|ico|svg|webp|pdf|zip|7z|gz|woff2?|ttf|otf|eot|dll|exe|xlsx|docx|pptx|mp4)$'
$excluidos = '(^|/)(hooks/tests/|node_modules/|\.git/)|(^|/)scan-secretos\.ps1$'

$patrones = @(
    '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'AKIA[0-9A-Z]{16}',
    'gh[pousr]_[A-Za-z0-9]{36,}',
    'sk-ant-[A-Za-z0-9_-]{20,}',
    'xox[baprs]-[A-Za-z0-9-]{10,}',
    '(?i)(password|passwd|pwd|secret|api[_-]?key|token)\s*[:=]\s*["''][^"'']{8,}["'']'
)

$errores = New-Object System.Collections.Generic.List[string]

foreach ($f in $archivos) {
    if ($f -match $excluidos) { continue }

    if ($f -match $extBinariosProhibidos -and ($permitidos -notcontains $f)) {
        $errores.Add("Binario o clave no permitido en el repositorio: $f (si es intencional, añádelo a .harness-allow-binarios)")
        continue
    }
    if ($f -match '(^|/)\.env(\.(?!example$|sample$|template$)[\w.-]+)?$') {
        $errores.Add("Archivo de secretos versionado: $f")
        continue
    }
    if ($f -match $extNoTexto -or -not (Test-Path -LiteralPath $f)) { continue }
    if ((Get-Item -LiteralPath $f -Force).Length -gt 1MB) { continue }

    $texto = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $f).Path)
    foreach ($p in $patrones) {
        if ($texto -match $p) { $errores.Add("Posible secreto en $f (patrón: $p)"); break }
    }
}

if ($errores.Count -gt 0) {
    Write-Host "Escaneo de seguridad: $($errores.Count) problema(s)" -ForegroundColor Red
    $errores | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}
Write-Host "Escaneo de seguridad: sin problemas ($($archivos.Count) archivos revisados)." -ForegroundColor Green
exit 0

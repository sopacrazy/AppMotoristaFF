# Script para gerar APK do App Motorista
# Uso: .\build-apk.ps1 [debug|release]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("debug", "release")]
    [string]$BuildType = "debug"
)

Write-Host "🚀 Iniciando processo de build do APK..." -ForegroundColor Cyan
Write-Host ""

# 1. Verificar se está no diretório correto
if (-not (Test-Path "package.json")) {
    Write-Host "❌ Erro: Execute este script na raiz do projeto!" -ForegroundColor Red
    exit 1
}

# 2. Build do web (Vite)
Write-Host "📦 Passo 1/4: Gerando build do web..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao gerar build do web!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Build do web concluído!" -ForegroundColor Green
Write-Host ""

# 3. Sincronizar Capacitor
Write-Host "🔄 Passo 2/4: Sincronizando Capacitor..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao sincronizar Capacitor!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Capacitor sincronizado!" -ForegroundColor Green
Write-Host ""

# 4. Navegar para pasta android
Push-Location android

# 5. Limpar build anterior (opcional)
Write-Host "🧹 Passo 3/4: Limpando builds anteriores..." -ForegroundColor Yellow
.\gradlew clean
Write-Host "✅ Limpeza concluída!" -ForegroundColor Green
Write-Host ""

# 6. Gerar APK
Write-Host "🔨 Passo 4/4: Gerando APK ($BuildType)..." -ForegroundColor Yellow
if ($BuildType -eq "release") {
    Write-Host "⚠️  ATENÇÃO: Build RELEASE requer assinatura!" -ForegroundColor Yellow
    Write-Host "   Se não tiver keystore configurado, use 'debug' ao invés de 'release'" -ForegroundColor Yellow
    Write-Host ""
    .\gradlew assembleRelease
} else {
    .\gradlew assembleDebug
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Erro ao gerar APK!" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

# 7. Localizar APK gerado
Write-Host ""
Write-Host "🔍 Procurando APK gerado..." -ForegroundColor Cyan

$apkPath = if ($BuildType -eq "release") {
    "android\app\build\outputs\apk\release\app-release-unsigned.apk"
} else {
    Get-ChildItem -Path "android\app\build\outputs\apk\debug" -Filter "*.apk" | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1 -ExpandProperty FullName
}

if (Test-Path $apkPath) {
    $apkInfo = Get-Item $apkPath
    Write-Host ""
    Write-Host "✅ APK gerado com sucesso!" -ForegroundColor Green
    Write-Host "📍 Localização: $($apkInfo.FullName)" -ForegroundColor Cyan
    Write-Host "📊 Tamanho: $([math]::Round($apkInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "💡 Dica: Para instalar no dispositivo conectado, execute:" -ForegroundColor Yellow
    Write-Host "   adb install `"$($apkInfo.FullName)`"" -ForegroundColor White
} else {
    Write-Host "⚠️  APK não encontrado no caminho esperado." -ForegroundColor Yellow
    Write-Host "   Verifique manualmente em: android\app\build\outputs\apk\$BuildType\" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ Processo concluído!" -ForegroundColor Green

# 📱 Guia para Gerar APK - App Motorista

Este guia explica como gerar o arquivo APK do aplicativo Android.

## 🚀 Método Rápido (Recomendado)

Use o script PowerShell automatizado:

```powershell
# APK Debug (para testes)
.\build-apk.ps1

# OU especificar explicitamente
.\build-apk.ps1 debug

# APK Release (para produção - requer keystore)
.\build-apk.ps1 release
```

## 📋 Método Manual

### Passo 1: Build do Web
```bash
npm run build
```

### Passo 2: Sincronizar Capacitor
```bash
npx cap sync android
```

### Passo 3: Gerar APK

**APK Debug (para testes):**
```bash
cd android
.\gradlew assembleDebug
```

**APK Release (para produção):**
```bash
cd android
.\gradlew assembleRelease
```

## 📍 Localização do APK Gerado

- **Debug:** `android/app/build/outputs/apk/debug/app-debug.apk`
- **Release:** `android/app/build/outputs/apk/release/app-release-unsigned.apk`

## 🔧 Usando Scripts NPM

Também adicionei scripts no `package.json`:

```bash
# Sincronizar apenas
npm run cap:sync

# Build completo + APK Debug
npm run apk:debug

# Build completo + APK Release
npm run apk:release
```

## ⚠️ Importante: APK Release

Para gerar um APK Release assinado (necessário para publicar na Play Store):

1. **Criar Keystore** (se ainda não tiver):
```bash
keytool -genkey -v -keystore fortfruit-release.keystore -alias fortfruit -keyalg RSA -keysize 2048 -validity 10000
```

2. **Configurar assinatura no `android/app/build.gradle`:**

Adicione antes do bloco `android {`:
```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

E dentro do bloco `buildTypes { release { } }`:
```gradle
release {
    signingConfig signingConfigs.release
    minifyEnabled false
    proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
}
```

E adicione antes do bloco `buildTypes`:
```gradle
signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
}
```

3. **Criar arquivo `android/keystore.properties`:**
```properties
storeFile=../fortfruit-release.keystore
keyAlias=fortfruit
storePassword=sua_senha_aqui
keyPassword=sua_senha_aqui
```

⚠️ **IMPORTANTE:** Adicione `keystore.properties` e `*.keystore` ao `.gitignore`!

## 📱 Instalar APK no Dispositivo

### Via ADB (Android Debug Bridge):
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Via Transferência Manual:
1. Copie o arquivo APK para o dispositivo
2. Abra o arquivo no dispositivo
3. Permita instalação de fontes desconhecidas se solicitado
4. Instale o aplicativo

## ✅ Checklist Antes de Gerar APK

- [ ] Build do web atualizado (`npm run build`)
- [ ] Capacitor sincronizado (`npx cap sync android`)
- [ ] Android SDK configurado corretamente
- [ ] Variáveis de ambiente configuradas (se necessário)
- [ ] Versão atualizada no `build.gradle` (se necessário)

## 🐛 Solução de Problemas

### Erro: "SDK location not found"
Verifique se o arquivo `android/local.properties` existe e contém:
```properties
sdk.dir=C:\\Users\\SEU_USUARIO\\AppData\\Local\\Android\\Sdk
```

### Erro: "Gradle sync failed"
Execute:
```bash
cd android
.\gradlew clean
```

### Erro: "Build failed"
1. Limpe o projeto: `.\gradlew clean`
2. Sincronize novamente: `npx cap sync android`
3. Tente gerar o APK novamente

## 📊 Informações do App

- **Package Name:** `com.fasttrack.driver`
- **App Name:** `FortFruit`
- **Versão Atual:** `2.0.3` (versionCode: 203)
- **Min SDK:** 23 (Android 6.0)
- **Target SDK:** 35 (Android 15)

## 🔗 Links Úteis

- [Documentação Capacitor](https://capacitorjs.com/docs)
- [Documentação Android Gradle](https://developer.android.com/studio/build)

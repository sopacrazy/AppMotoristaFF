import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lê a versão do package.json
const packageJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8')
);
const version = packageJson.version;

if (!version) {
  console.error('❌ Erro: Versão não encontrada no package.json');
  process.exit(1);
}

const distPath = path.join(__dirname, 'dist');
const updatesDir = path.join(__dirname, 'updates');
const versionDir = path.join(updatesDir, `v${version}`);
const zipPath = path.join(updatesDir, `v${version}.zip`);

// Verifica se a pasta dist existe
if (!fs.existsSync(distPath)) {
  console.error('❌ Erro: Pasta "dist" não encontrada!');
  console.log('💡 Execute "npm run build" primeiro para gerar os arquivos.');
  process.exit(1);
}

// Cria a pasta updates se não existir
if (!fs.existsSync(updatesDir)) {
  fs.mkdirSync(updatesDir, { recursive: true });
  console.log('✅ Pasta "updates" criada');
}

// Cria a pasta da versão se não existir
if (!fs.existsSync(versionDir)) {
  fs.mkdirSync(versionDir, { recursive: true });
  console.log(`✅ Pasta "updates/v${version}" criada`);
}

// Copia os arquivos de dist para a pasta da versão
console.log('📦 Copiando arquivos de "dist" para pasta de versão...');
copyDirectory(distPath, versionDir);
console.log('✅ Arquivos copiados com sucesso!');

// Cria o ZIP
console.log(`🗜️  Criando ZIP: v${version}.zip...`);

const output = createWriteStream(zipPath);
const archive = archiver('zip', {
  zlib: { level: 9 }, // Máxima compressão
});

output.on('close', () => {
  const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2);
  console.log(`✅ ZIP criado com sucesso!`);
  console.log(`📊 Tamanho: ${sizeMB} MB`);
  console.log(`📁 Local: ${zipPath}`);
  
  // Atualiza automaticamente a URL no server.js
  try {
    const serverJsPath = path.join(__dirname, 'server.js');
    let serverContent = fs.readFileSync(serverJsPath, 'utf-8');
    
    // Procura e atualiza a URL do ZIP
    const urlPattern = /url:\s*"https:\/\/academy\.fortfruit\.com\.br\/updates\/v[\d.]+\.zip"/;
    const newUrl = `url: "https://academy.fortfruit.com.br/updates/v${version}.zip"`;
    
    if (urlPattern.test(serverContent)) {
      serverContent = serverContent.replace(urlPattern, newUrl);
      fs.writeFileSync(serverJsPath, serverContent, 'utf-8');
      console.log(`✅ URL atualizada automaticamente no server.js`);
    } else {
      console.log(`⚠️  Não foi possível atualizar a URL automaticamente.`);
      console.log(`💡 Atualize manualmente no server.js:`);
      console.log(`   url: "https://academy.fortfruit.com.br/updates/v${version}.zip"`);
    }
  } catch (err) {
    console.warn(`⚠️  Erro ao atualizar server.js:`, err.message);
    console.log(`💡 Atualize manualmente a URL no server.js:`);
    console.log(`   url: "https://academy.fortfruit.com.br/updates/v${version}.zip"`);
  }
  
  console.log(`\n🎉 Atualização v${version} pronta para deploy!`);
});

archive.on('error', (err) => {
  console.error('❌ Erro ao criar ZIP:', err);
  process.exit(1);
});

archive.pipe(output);

// Adiciona todos os arquivos da pasta da versão ao ZIP
archive.directory(versionDir, false);

archive.finalize();

// Função auxiliar para copiar diretório recursivamente
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}


# 🚀 Guia de Deploy em Produção - App Motorista

## ⚠️ PROBLEMA ATUAL: PM2 com erro ENOENT

O erro `ENOENT: no such file or directory, uv_cwd` acontece porque o PM2 perdeu a referência do diretório após mover os arquivos.

## 🔧 SOLUÇÃO PASSO A PASSO

### 1. Parar e remover o processo PM2 corrompido

```bash
# Tentar parar normalmente (pode falhar, mas tente primeiro)
pm2 stop academy

# Se falhar, matar o processo diretamente
sudo kill -9 $(ps aux | grep 'node.*server.js' | grep -v grep | awk '{print $2}')

# Remover do PM2
pm2 delete academy

# Limpar processos órfãos
pm2 kill
pm2 resurrect
```

### 2. Verificar estrutura de diretórios

```bash
# Ir para o diretório correto
cd /var/www/html/academy

# Verificar se os arquivos estão lá
ls -la
# Deve mostrar: server.js, dist/, package.json, etc.

# Verificar se dist/ tem os arquivos
ls -la dist/
# Deve mostrar: index.html, assets/, etc.
```

### 3. Verificar variáveis de ambiente

```bash
# Criar/editar .env se não existir
nano /var/www/html/academy/.env
```

**Conteúdo do .env:**

```env
NODE_ENV=production
PORT=3001
BASE_URL=https://academy.fortfruit.com.br

# MySQL Principal
DB_HOST=seu_host_mysql
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=seu_banco

# MySQL Ocorrências
DB_HOST_OCORRENCIAS=seu_host_mysql
DB_USER_OCORRENCIAS=seu_usuario
DB_PASSWORD_OCORRENCIAS=sua_senha
DB_NAME_OCORRENCIAS=seu_banco_ocorrencias

# Fuso horário
TZ_OFFSET=-03:00
```

### 4. Reinstalar dependências (se necessário)

```bash
cd /var/www/html/academy
npm install --production
```

### 5. Iniciar o servidor com PM2 (caminho correto)

```bash
cd /var/www/html/academy

# Iniciar o PM2 com o caminho absoluto correto
pm2 start server.js \
  --name academy \
  --cwd /var/www/html/academy \
  --env production \
  --log /var/www/html/academy/logs/pm2.log \
  --error /var/www/html/academy/logs/pm2-error.log \
  --out /var/www/html/academy/logs/pm2-out.log

# OU usar um arquivo de configuração (recomendado)
```

### 6. Criar arquivo de configuração PM2 (RECOMENDADO)

Crie o arquivo `ecosystem.config.js`:

```bash
nano /var/www/html/academy/ecosystem.config.js
```

**Conteúdo:**

```javascript
module.exports = {
  apps: [
    {
      name: "academy",
      script: "./server.js",
      cwd: "/var/www/html/academy",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3001,
      },
      error_file: "/var/www/html/academy/logs/pm2-error.log",
      out_file: "/var/www/html/academy/logs/pm2-out.log",
      log_file: "/var/www/html/academy/logs/pm2-combined.log",
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
    },
  ],
};
```

Depois, iniciar com:

```bash
cd /var/www/html/academy
pm2 start ecosystem.config.js
```

### 7. Salvar configuração do PM2

```bash
pm2 save
pm2 startup
# Execute o comando que aparecer (geralmente algo como):
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u adriano-martins --hp /home/adriano-martins
```

### 8. Verificar se está rodando

```bash
# Status do PM2
pm2 status

# Logs em tempo real
pm2 logs academy

# Verificar se a porta está escutando
sudo netstat -tlnp | grep 3001
# OU
sudo ss -tlnp | grep 3001
```

### 9. Testar o servidor

```bash
# Testar health check
curl http://localhost:3001/health

# Testar se o frontend está sendo servido
curl http://localhost:3001/

# Verificar logs
pm2 logs academy --lines 50
```

### 10. Configurar Apache (se ainda não estiver configurado)

```bash
sudo nano /etc/apache2/sites-available/academy.fortfruit.com.br.conf
```

**Conteúdo:**

```apache
<VirtualHost *:443>
    ServerName academy.fortfruit.com.br

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/ssl/certs/academy.fortfruit.com.br.crt
    SSLCertificateKeyFile /etc/ssl/private/academy.fortfruit.com.br.key

    # Proxy para Node.js
    ProxyPreserveHost On
    ProxyRequests Off

    # API routes
    ProxyPass /api http://localhost:3001/api
    ProxyPassReverse /api http://localhost:3001/api

    # Health check
    ProxyPass /health http://localhost:3001/health
    ProxyPassReverse /health http://localhost:3001/health

    # Updates
    ProxyPass /updates http://localhost:3001/updates
    ProxyPassReverse /updates http://localhost:3001/updates

    # Check update
    ProxyPass /check-update http://localhost:3001/check-update
    ProxyPassReverse /check-update http://localhost:3001/check-update

    # Frontend (deve ser o último)
    ProxyPass / http://localhost:3001/
    ProxyPassReverse / http://localhost:3001/

    # Headers
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Port "443"
</VirtualHost>
```

Ativar o site:

```bash
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo a2enmod headers
sudo a2ensite academy.fortfruit.com.br.conf
sudo systemctl reload apache2
```

## 🔍 COMANDOS ÚTEIS PARA DEBUG

```bash
# Ver processos Node.js rodando
ps aux | grep node

# Ver porta 3001
sudo lsof -i :3001

# Ver logs do Apache
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/apache2/access.log

# Reiniciar PM2
pm2 restart academy

# Ver informações detalhadas
pm2 describe academy

# Monitorar recursos
pm2 monit
```

## ✅ CHECKLIST FINAL

- [ ] PM2 rodando sem erros (`pm2 status`)
- [ ] Servidor respondendo em `http://localhost:3001/health`
- [ ] Apache configurado e rodando
- [ ] Site acessível em `https://academy.fortfruit.com.br`
- [ ] Logs sem erros críticos
- [ ] Variáveis de ambiente configuradas
- [ ] Banco de dados conectando corretamente

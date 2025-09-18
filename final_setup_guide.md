# Guia de Instalação Completo - Sistema AEMOZ

Este guia irá te ajudar a instalar e configurar o sistema completo do zero.

## Pré-requisitos

Antes de começar, certifique-se de ter instalado:

- **Node.js 16+**: [Download aqui](https://nodejs.org/)
- **PostgreSQL 12+**: [Download aqui](https://www.postgresql.org/download/)
- **Git**: [Download aqui](https://git-scm.com/)

## Instalação Passo a Passo

### 1. Clonar o Repositório

```bash
# Criar pasta do projeto
mkdir aemoz-sistema
cd aemoz-sistema

# Inicializar git (se for novo projeto)
git init
```

### 2. Criar Estrutura de Arquivos

Crie os seguintes arquivos baseados nos artifacts fornecidos:

**Frontend:**
- `index.html` - Interface principal
- `style.css` - Estilos responsivos  
- `script.js` - Lógica do frontend (versão atualizada com API)

**Backend:**
- `package.json` - Configuração do Node.js
- `server.js` - Servidor Express (renomeie `backend_server.js`)
- `.env.example` - Template de variáveis de ambiente

**Scripts de Banco:**
- `scripts/init.sql` - Schema do banco
- `scripts/seed.sql` - Dados iniciais
- `scripts/migrate.js` - Script de migração
- `scripts/backup.js` - Script de backup
- `scripts/cleanup.js` - Script de limpeza
- `scripts/generate-jwt-secret.js` - Gerador de JWT

**Configuração:**
- `Dockerfile` - Configuração Docker
- `docker-compose.yml` - Orquestração de serviços
- `nginx/nginx.conf` - Configuração do proxy
- `Makefile` - Comandos automatizados

### 3. Configurar Dependências

```bash
# Instalar dependências do backend
npm install express pg cors helmet bcrypt jsonwebtoken express-rate-limit dotenv joi compression morgan

# Dependências de desenvolvimento
npm install --save-dev nodemon jest supertest eslint
```

### 4. Configurar Banco de Dados

```bash
# Criar usuário e banco PostgreSQL
sudo -u postgres psql << EOF
CREATE USER aemoz_user WITH ENCRYPTED PASSWORD 'aemoz_secure_2024';
CREATE DATABASE aemoz_db OWNER aemoz_user;
GRANT ALL PRIVILEGES ON DATABASE aemoz_db TO aemoz_user;
ALTER USER aemoz_user CREATEDB;
\q
EOF
```

### 5. Configurar Variáveis de Ambiente

```bash
# Copiar template
cp .env.example .env

# Editar com suas configurações
nano .env
```

Configure as seguintes variáveis no `.env`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://aemoz_user:aemoz_secure_2024@localhost:5432/aemoz_db
JWT_SECRET=sua_chave_jwt_super_secreta_de_64_caracteres_aqui
ADMIN_PASSWORD=aemoz2025
FRONTEND_URL=http://localhost:3000
```

### 6. Executar Migrações

```bash
# Executar script de migração
node scripts/migrate.js

# Popular com dados iniciais
node scripts/seed.js
```

### 7. Testar a Aplicação

```bash
# Iniciar o servidor
npm start

# Em outro terminal, testar
curl http://localhost:3000/api/health
```

## Métodos de Deploy

### Opção A: Docker (Recomendado)

```bash
# Build e iniciar containers
docker-compose up -d

# Verificar logs
docker-compose logs -f
```

### Opção B: Servidor Local

```bash
# Iniciar PostgreSQL (se não estiver rodando)
sudo systemctl start postgresql

# Iniciar aplicação
npm start
```

### Opção C: Railway (Produção)

```bash
# Instalar CLI
npm install -g @railway/cli

# Login e deploy
railway login
railway up
```

## Estrutura Final do Projeto

```
aemoz-sistema/
├── package.json
├── server.js
├── .env
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── Makefile
├── README.md
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── scripts/
│   ├── init.sql
│   ├── seed.sql
│   ├── migrate.js
│   ├── backup.js
│   ├── cleanup.js
│   └── generate-jwt-secret.js
├── nginx/
│   ├── nginx.conf
│   └── ssl/
├── logs/
├── uploads/
└── backups/
```

## Verificação da Instalação

### 1. Testar Frontend
- Acesse: `http://localhost:3000`
- Verifique se a tela inicial carrega
- Teste cadastro de participante

### 2. Testar Backend
- API Health: `http://localhost:3000/api/health`
- Estatísticas: `http://localhost:3000/api/stats`

### 3. Testar Admin
- Acesse área administrativa
- Login com senha: `aemoz2025`
- Verifique painel administrativo

## Comandos Úteis

```bash
# Verificar status
make status

# Executar testes
make test

# Backup dos dados
make backup

# Limpeza automática
make cleanup

# Ver logs
make logs

# Reset completo
make full-reset
```

## Solução de Problemas

### Erro de Conexão com Banco

```bash
# Verificar se PostgreSQL está rodando
sudo systemctl status postgresql

# Reiniciar se necessário
sudo systemctl restart postgresql

# Testar conexão
psql -h localhost -U aemoz_user -d aemoz_db
```

### Porta já em Uso

```bash
# Verificar processo na porta 3000
lsof -i :3000

# Matar processo se necessário
kill -9 <PID>
```

### Problemas de Permissão

```bash
# Corrigir permissões dos scripts
chmod +x scripts/*.sh
chmod +x deploy.sh
chmod +x setup.sh
```

## Segurança

### Para Produção

1. **Altere senhas padrão**
   ```bash
   # No .env
   ADMIN_PASSWORD=senha_forte_producao
   ```

2. **Configure SSL**
   ```bash
   # Let's Encrypt
   sudo certbot --nginx -d seu-dominio.com
   ```

3. **Configure firewall**
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw enable
   ```

## Próximos Passos

1. **Personalização**
   - Altere cores e logo no CSS
   - Configure domínio personalizado
   - Adicione cursos específicos

2. **Monitoramento**
   - Configure logs centralizados
   - Adicione alertas de erro
   - Monitore performance

3. **Backup**
   - Configure backup automático
   - Teste restauração
   - Documente procedimentos

## Suporte

Se encontrar problemas:

1. Verifique os logs: `make logs`
2. Consulte a documentação no README.md
3. Execute diagnóstico: `make status`
4. Verifique configurações no .env

Para suporte técnico, crie uma issue no repositório do projeto.
# AEMOZ - Sistema de Sorteio UNILAB

Sistema web para sorteio de grupos da Associação dos Estudantes Moçambicanos (AEMOZ) da UNILAB.

## 📋 Visão Geral

O sistema permite cadastro de participantes, organização por curso e realização de sorteios automáticos para formar grupos equilibrados.

### Funcionalidades Principais

- ✅ Cadastro de participantes (nome, curso, semestre)
- ✅ Interface administrativa protegida por senha
- ✅ Sorteio automático com mistura por curso
- ✅ Visualização de grupos formados
- ✅ Estatísticas em tempo real
- ✅ Sistema responsivo para mobile
- ✅ Dados persistentes no navegador

### Tecnologias

**Frontend:**
- HTML5, CSS3, JavaScript vanilla
- Design responsivo com gradientes modernos
- Armazenamento local (localStorage)

**Backend:**
- Node.js + Express
- PostgreSQL
- JWT para autenticação
- Docker para containerização

## 🚀 Instalação Rápida

### Pré-requisitos

- Node.js 16+
- PostgreSQL 12+
- Docker (opcional)

### Método 1: Configuração Automatizada

```bash
# 1. Clonar o repositório
git clone https://github.com/aemoz/sistema-sorteio.git
cd sistema-sorteio

# 2. Executar configuração completa
make full-setup

# 3. Configurar .env (editar com seus dados)
nano .env

# 4. Iniciar aplicação
make dev
```

### Método 2: Docker (Recomendado)

```bash
# 1. Clonar o repositório
git clone https://github.com/aemoz/sistema-sorteio.git
cd sistema-sorteio

# 2. Configurar variáveis
cp .env.example .env
# Editar .env com suas configurações

# 3. Iniciar com Docker
make docker-run
```

### Método 3: Manual

```bash
# 1. Instalar dependências
npm install

# 2. Configurar banco
createdb aemoz_db
psql aemoz_db < scripts/init.sql

# 3. Configurar .env
cp .env.example .env

# 4. Executar migrações
npm run migrate
npm run seed

# 5. Iniciar
npm start
```

## 📖 Como Usar

### Acesso ao Sistema

1. **Frontend**: http://localhost:3000
2. **API**: http://localhost:3000/api
3. **Admin**: Clique em "Área Administrativa"
   - Senha padrão: `aemoz2025`

### Fluxo Básico

1. **Cadastrar Participantes**
   - Acesse a tela inicial
   - Clique em "Fazer Cadastro"
   - Preencha: nome, curso, semestre

2. **Realizar Sorteio** (Admin)
   - Faça login na área administrativa
   - Aguarde pelo menos 16 participantes
   - Clique em "Iniciar Sorteio"
   - Visualize os grupos formados

3. **Gerenciar Dados** (Admin)
   - Ver lista de participantes
   - Excluir participantes
   - Baixar relatórios
   - Limpar dados

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```bash
# Servidor
NODE_ENV=development
PORT=3000

# Banco de dados
DATABASE_URL=postgresql://user:password@localhost:5432/aemoz_db

# Segurança
JWT_SECRET=sua_chave_jwt_super_secreta_aqui
ADMIN_PASSWORD=aemoz2025

# Frontend
FRONTEND_URL=http://localhost:3001

# Rate limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
```

### Cursos Disponíveis

O sistema inclui todos os cursos da UNILAB:

- Administração Pública
- Agronomia
- Antropologia
- Bacharelado em Humanidades
- Ciências Biológicas
- Medicina
- Engenharia de Computação
- Relações Internacionais
- E mais...

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento
make dev              # Iniciar desenvolvimento
make test            # Executar testes
make lint            # Verificar código

# Banco de dados
make db-migrate      # Executar migrações
make db-seed         # Popular com dados iniciais
make db-reset        # Reset completo

# Docker
make docker-build    # Build da imagem
make docker-run      # Iniciar containers
make docker-stop     # Parar containers

# Deploy
make deploy-dev      # Deploy desenvolvimento
make deploy-prod     # Deploy produção

# Utilitários
make backup          # Backup dos dados
make cleanup         # Limpeza automática
make logs            # Ver logs
```

## 🏗️ Arquitetura

### Estrutura do Projeto

```
aemoz-sistema/
├── frontend/
│   ├── index.html          # Interface principal
│   ├── style.css           # Estilos responsivos
│   └── script.js           # Lógica frontend
├── backend/
│   ├── server.js           # Servidor Express
│   ├── package.json        # Dependências
│   └── scripts/            # Scripts utilitários
├── scripts/
│   ├── init.sql            # Schema do banco
│   ├── seed.sql            # Dados iniciais
│   ├── migrate.js          # Migrações
│   ├── backup.js           # Backup automático
│   └── cleanup.js          # Limpeza de dados
├── nginx/
│   ├── nginx.conf          # Configuração proxy
│   └── ssl/                # Certificados SSL
├── docker-compose.yml      # Orquestração Docker
├── Dockerfile             # Imagem Docker
├── Makefile              # Comandos automatizados
└── .env.example          # Variáveis de ambiente
```

### Fluxo de Dados

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   PostgreSQL    │
│                 │    │                 │    │                 │
│ • Interface     │◄──►│ • API REST      │◄──►│ • Participantes │
│ • Validações    │    │ • Autenticação  │    │ • Grupos        │
│ • Sorteio       │    │ • Rate Limiting │    │ • Auditoria     │
│ • Estatísticas  │    │ • Logs          │    │ • Sessões       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📱 Responsividade

O sistema é totalmente responsivo:

- **Desktop**: Interface completa com todas as funcionalidades
- **Tablet**: Layout adaptado para touch
- **Mobile**: Interface otimizada, navegação simplificada
- **PWA**: Instalável como aplicativo

## 🔒 Segurança

### Medidas Implementadas

- Rate limiting (100 req/min por IP)
- Validação de entrada rigorosa
- Senhas hasheadas (bcrypt)
- Tokens JWT com expiração
- Headers de segurança (Helmet.js)
- Sanitização de dados SQL
- CORS configurado
- SSL/TLS recomendado

### Auditoria

- Log de todas as ações administrativas
- Rastreamento de alterações
- Backup automático
- Monitoramento de tentativas de login

## 🚀 Deploy

### Opções de Hospedagem

1. **Railway** (Recomendado)
```bash
npm install -g @railway/cli
railway login
railway up
```

2. **Vercel**
```bash
npm install -g vercel
vercel --prod
```

3. **Heroku**
```bash
git push heroku main
```

4. **Servidor Próprio**
```bash
make deploy-prod
```

### Configuração de Produção

1. **Banco de Dados**
   - Use PostgreSQL gerenciado (AWS RDS, Google Cloud SQL)
   - Configure backups automáticos
   - Monitore performance

2. **Domínio e SSL**
   - Configure domínio personalizado
   - Use Let's Encrypt ou Cloudflare
   - Configure redirects HTTPS

3. **Monitoramento**
   - Configure logs centralizados
   - Use ferramentas como Sentry
   - Configure alertas

## 📊 API

### Endpoints Públicos

- `GET /api/health` - Status da aplicação
- `GET /api/stats` - Estatísticas públicas
- `POST /api/participants` - Cadastrar participante

### Endpoints Administrativos

- `POST /api/auth/login` - Login admin
- `GET /api/admin/participants` - Listar participantes
- `DELETE /api/admin/participants/:id` - Excluir participante
- `POST /api/admin/sorteio` - Realizar sorteio
- `GET /api/admin/sorteio/result` - Resultado do sorteio

### Exemplo de Uso

```javascript
// Cadastrar participante
const response = await fetch('/api/participants', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nome: 'João Silva',
    curso: 'Medicina',
    semestre: 3
  })
});

// Login administrativo
const login = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: 'aemoz2025' })
});
```

## 🧪 Testes

### Executar Testes

```bash
npm test                # Todos os testes
npm run test:watch      # Modo watch
npm run test:coverage   # Com cobertura
```

### Estrutura de Testes

```
tests/
├── unit/              # Testes unitários
├── integration/       # Testes de integração
├── e2e/              # Testes end-to-end
└── fixtures/         # Dados de teste
```

## 🐛 Troubleshooting

### Problemas Comuns

1. **Erro de conexão com banco**
   ```bash
   # Verificar se PostgreSQL está rodando
   pg_isready
   
   # Verificar configuração
   echo $DATABASE_URL
   ```

2. **Porta já em uso**
   ```bash
   # Verificar processo usando a porta
   lsof -i :3000
   
   # Matar processo
   kill -9 <PID>
   ```

3. **Problemas de permissão**
   ```bash
   # Corrigir permissões
   chmod +x scripts/*.sh
   ```

4. **Erro de JWT**
   ```bash
   # Gerar nova chave
   make generate-jwt
   ```

### Logs

```bash
# Logs da aplicação
make logs

# Logs do Docker
make docker-logs

# Logs de erro
tail -f logs/error.log
```

## 🤝 Contribuição

### Como Contribuir

1. Fork o repositório
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit suas mudanças: `git commit -m 'Adicionar nova funcionalidade'`
4. Push para a branch: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

### Padrões de Código

- Use ESLint e Prettier
- Siga convenções de commit
- Adicione testes para novas funcionalidades
- Documente mudanças no README

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👥 Equipe

**AEMOZ - Associação dos Estudantes Moçambicanos**
- UNILAB - Universidade da Integração Internacional da Lusofonia Afro-Brasileira
- Campus: Redenção, CE - Brasil

### Contato

- Email: aemoz@unilab.edu.br
- Site: https://unilab.edu.br
- GitHub: https://github.com/aemoz

## 📈 Roadmap

### Versão Atual (v1.0)
- ✅ Sistema básico de sorteio
- ✅ Interface responsiva
- ✅ Autenticação administrativa
- ✅ Deploy via Docker

### Próximas Versões

**v1.1**
- [ ] Notificações por email
- [ ] Exportação PDF melhorada
- [ ] Dashboard com gráficos
- [ ] API para mobile

**v1.2**
- [ ] Múltiplos sorteios simultâneos
- [ ] Sistema de permissões
- [ ] Integração com calendário
- [ ] Chat dos grupos

**v2.0**
- [ ] Aplicativo móvel
- [ ] Integração com sistemas UNILAB
- [ ] Machine learning para balanceamento
- [ ] Relatórios avançados

## 📚 Referências

- [Express.js Documentation](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [UNILAB - Site Oficial](https://unilab.edu.br)

---

**Desenvolvido com 💙 pela AEMOZ para a comunidade estudantil da UNILAB**
# Makefile para AEMOZ Sistema de Sorteio

.PHONY: help install dev build start test clean deploy backup restore logs

# Configurações
NODE_VERSION := 18
PROJECT_NAME := aemoz-backend

# Cores para output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

help: ## Mostrar esta ajuda
	@echo "$(BLUE)AEMOZ - Sistema de Sorteio$(NC)"
	@echo "============================"
	@echo ""
	@echo "Comandos disponíveis:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-15s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Instalar dependências
	@echo "$(BLUE)📦 Instalando dependências...$(NC)"
	npm ci
	@echo "$(GREEN)✅ Dependências instaladas$(NC)"

install-dev: ## Instalar dependências de desenvolvimento
	@echo "$(BLUE)🔧 Instalando dependências de desenvolvimento...$(NC)"
	npm install
	@echo "$(GREEN)✅ Dependências de desenvolvimento instaladas$(NC)"

setup: ## Configuração inicial do projeto
	@echo "$(BLUE)🔧 Configuração inicial...$(NC)"
	@chmod +x scripts/*.sh
	@./scripts/setup.sh full
	@make install
	@make generate-jwt
	@echo "$(GREEN)✅ Configuração inicial concluída$(NC)"

env: ## Criar arquivo .env baseado no exemplo
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "$(YELLOW)⚠️  Arquivo .env criado. Configure as variáveis antes de continuar$(NC)"; \
	else \
		echo "$(YELLOW)⚠️  Arquivo .env já existe$(NC)"; \
	fi

generate-jwt: ## Gerar nova chave JWT
	@echo "$(BLUE)🔐 Gerando chave JWT...$(NC)"
	@node scripts/generate-jwt-secret.js

db-create: ## Criar banco de dados
	@echo "$(BLUE)🗄️  Criando banco de dados...$(NC)"
	createdb $(PROJECT_NAME)_db || echo "Banco já existe"
	@echo "$(GREEN)✅ Banco de dados criado$(NC)"

db-migrate: ## Executar migrações do banco
	@echo "$(BLUE)🔄 Executando migrações...$(NC)"
	npm run migrate
	@echo "$(GREEN)✅ Migrações executadas$(NC)"

db-seed: ## Executar seed do banco
	@echo "$(BLUE)🌱 Executando seed...$(NC)"
	npm run seed
	@echo "$(GREEN)✅ Seed executado$(NC)"

db-reset: ## Reset completo do banco
	@echo "$(RED)⚠️  ATENÇÃO: Isto irá apagar todos os dados!$(NC)"
	@read -p "Tem certeza? (y/N): " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		dropdb $(PROJECT_NAME)_db || true; \
		make db-create; \
		make db-migrate; \
		make db-seed; \
	else \
		echo "Operação cancelada"; \
	fi

dev: ## Iniciar em modo desenvolvimento
	@echo "$(BLUE)🚀 Iniciando modo desenvolvimento...$(NC)"
	npm run dev

start: ## Iniciar aplicação
	@echo "$(BLUE)🚀 Iniciando aplicação...$(NC)"
	npm start

build: ## Build da aplicação
	@echo "$(BLUE)🔨 Fazendo build...$(NC)"
	@if grep -q "\"build\":" package.json; then npm run build; else echo "Nenhum script de build definido"; fi
	@echo "$(GREEN)✅ Build concluído$(NC)"

test: ## Executar testes
	@echo "$(BLUE)🧪 Executando testes...$(NC)"
	npm test
	@echo "$(GREEN)✅ Testes concluídos$(NC)"

test-watch: ## Executar testes em modo watch
	@echo "$(BLUE)🧪 Executando testes (modo watch)...$(NC)"
	npm run test:watch

lint: ## Executar linting
	@echo "$(BLUE)🔍 Executando linting...$(NC)"
	npm run lint
	@echo "$(GREEN)✅ Linting concluído$(NC)"

lint-fix: ## Corrigir problemas de linting automaticamente
	@echo "$(BLUE)🔧 Corrigindo problemas de linting...$(NC)"
	npm run lint:fix
	@echo "$(GREEN)✅ Correções aplicadas$(NC)"

clean: ## Limpar arquivos temporários
	@echo "$(BLUE)🧹 Limpando arquivos temporários...$(NC)"
	rm -rf node_modules
	rm -rf logs/*.log
	rm -rf uploads/*
	npm cache clean --force
	@echo "$(GREEN)✅ Limpeza concluída$(NC)"

backup: ## Criar backup dos dados
	@echo "$(BLUE)💾 Criando backup...$(NC)"
	node scripts/backup.js
	@echo "$(GREEN)✅ Backup criado$(NC)"

cleanup: ## Limpeza de dados antigos
	@echo "$(BLUE)🧹 Executando limpeza de dados...$(NC)"
	node scripts/cleanup.js
	@echo "$(GREEN)✅ Limpeza executada$(NC)"

logs: ## Ver logs da aplicação
	@echo "$(BLUE)📋 Logs da aplicação:$(NC)"
	@if [ -f logs/app.log ]; then tail -f logs/app.log; else echo "Nenhum log encontrado"; fi

health: ## Verificar saúde da aplicação
	@echo "$(BLUE)🏥 Verificando saúde da aplicação...$(NC)"
	@curl -f http://localhost:3000/api/health || echo "$(RED)❌ Aplicação não está respondendo$(NC)"

# Comandos Docker
docker-build: ## Build da imagem Docker
	@echo "$(BLUE)🐳 Build da imagem Docker...$(NC)"
	docker build -t $(PROJECT_NAME):latest .
	@echo "$(GREEN)✅ Imagem Docker criada$(NC)"

docker-run: ## Executar container Docker
	@echo "$(BLUE)🐳 Executando container...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✅ Container iniciado$(NC)"

docker-stop: ## Parar containers Docker
	@echo "$(BLUE)🐳 Parando containers...$(NC)"
	docker-compose down
	@echo "$(GREEN)✅ Containers parados$(NC)"

docker-logs: ## Ver logs do Docker
	@echo "$(BLUE)📋 Logs do Docker:$(NC)"
	docker-compose logs -f

docker-clean: ## Limpar imagens Docker não utilizadas
	@echo "$(BLUE)🧹 Limpando Docker...$(NC)"
	docker system prune -f
	@echo "$(GREEN)✅ Docker limpo$(NC)"

# Deploy
deploy-dev: ## Deploy para desenvolvimento
	@echo "$(BLUE)🚀 Deploy para desenvolvimento...$(NC)"
	@chmod +x scripts/deploy.sh
	./scripts/deploy.sh local

deploy-docker: ## Deploy via Docker
	@echo "$(BLUE)🚀 Deploy via Docker...$(NC)"
	@chmod +x scripts/deploy.sh
	./scripts/deploy.sh docker

deploy-prod: ## Deploy para produção
	@echo "$(BLUE)🚀 Deploy para produção...$(NC)"
	@chmod +x scripts/production-deploy.sh
	./scripts/production-deploy.sh

# Utilitários
check-deps: ## Verificar dependências desatualizadas
	@echo "$(BLUE)🔍 Verificando dependências...$(NC)"
	npm outdated

update-deps: ## Atualizar dependências
	@echo "$(BLUE)📦 Atualizando dependências...$(NC)"
	npm update
	@echo "$(GREEN)✅ Dependências atualizadas$(NC)"

security-audit: ## Auditoria de segurança
	@echo "$(BLUE)🔒 Executando auditoria de segurança...$(NC)"
	npm audit
	npm audit fix

status: ## Status do projeto
	@echo "$(BLUE)📊 Status do Projeto$(NC)"
	@echo "==================="
	@echo "Node.js: $$(node -v 2>/dev/null || echo 'Não instalado')"
	@echo "npm: $$(npm -v 2>/dev/null || echo 'Não instalado')"
	@echo "Docker: $$(docker -v 2>/dev/null || echo 'Não instalado')"
	@echo ""
	@echo "Arquivos de configuração:"
	@[ -f .env ] && echo "✅ .env" || echo "❌ .env"
	@[ -f package.json ] && echo "✅ package.json" || echo "❌ package.json"
	@[ -f docker-compose.yml ] && echo "✅ docker-compose.yml" || echo "❌ docker-compose.yml"
	@echo ""
	@echo "Dependências instaladas: $$([ -d node_modules ] && echo 'Sim' || echo 'Não')"
	@echo ""
	@if command -v psql >/dev/null 2>&1; then \
		echo "PostgreSQL: Instalado"; \
		echo "Bancos disponíveis:"; \
		psql -l 2>/dev/null | grep $(PROJECT_NAME) || echo "Nenhum banco do projeto encontrado"; \
	else \
		echo "PostgreSQL: Não instalado"; \
	fi

# Aliases úteis
run: start ## Alias para start
server: start ## Alias para start
migrate: db-migrate ## Alias para db-migrate
seed: db-seed ## Alias para db-seed

# Comandos compostos
full-setup: clean install env generate-jwt db-create db-migrate db-seed ## Setup completo do projeto
	@echo "$(GREEN)🎉 Setup completo concluído!$(NC)"
	@echo ""
	@echo "Para iniciar o desenvolvimento:"
	@echo "  make dev"
	@echo ""
	@echo "Para fazer deploy:"
	@echo "  make deploy-dev"

full-reset: clean full-setup ## Reset completo do projeto
	@echo "$(GREEN)🎉 Reset completo concluído!$(NC)"

ci: install lint test ## Pipeline de CI (Continuous Integration)
	@echo "$(GREEN)✅ Pipeline CI passou$(NC)"

cd: ci build ## Pipeline de CD (Continuous Deployment)
	@echo "$(GREEN)✅ Pipeline CD concluído$(NC)"

# Default target
all: help
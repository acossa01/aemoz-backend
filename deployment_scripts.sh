#!/bin/bash
# deploy.sh - Script principal de deploy

set -e  # Parar execução em caso de erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 AEMOZ - Deploy Script${NC}"
echo "=================================="

# Verificar se .env existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  Arquivo .env não encontrado!${NC}"
    echo "Copiando .env.example para .env..."
    cp .env.example .env
    echo -e "${RED}❌ Configure as variáveis em .env antes de continuar${NC}"
    exit 1
fi

# Função para verificar dependências
check_dependencies() {
    echo -e "${BLUE}🔍 Verificando dependências...${NC}"
    
    # Verificar Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}❌ Node.js não encontrado. Instale Node.js 16+${NC}"
        exit 1
    fi
    
    node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 16 ]; then
        echo -e "${RED}❌ Node.js versão 16+ é necessária. Atual: $(node -v)${NC}"
        exit 1
    fi
    
    # Verificar Docker (opcional)
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✅ Docker encontrado: $(docker --version)${NC}"
        DOCKER_AVAILABLE=true
    else
        echo -e "${YELLOW}⚠️  Docker não encontrado (deploy local)${NC}"
        DOCKER_AVAILABLE=false
    fi
    
    # Verificar PostgreSQL (se não usar Docker)
    if [ "$DOCKER_AVAILABLE" = false ]; then
        if ! command -v psql &> /dev/null; then
            echo -e "${RED}❌ PostgreSQL não encontrado. Instale PostgreSQL ou Docker${NC}"
            exit 1
        fi
    fi
    
    echo -e "${GREEN}✅ Dependências verificadas${NC}"
}

# Função para setup do banco de dados
setup_database() {
    echo -e "${BLUE}🗄️  Configurando banco de dados...${NC}"
    
    if [ "$DOCKER_AVAILABLE" = true ]; then
        echo "Usando PostgreSQL via Docker..."
        docker-compose up -d postgres
        
        # Aguardar banco estar pronto
        echo "Aguardando banco de dados..."
        sleep 10
        
        # Executar migrações
        npm run migrate
    else
        echo "Usando PostgreSQL local..."
        # Criar banco se não existir
        createdb aemoz_db 2>/dev/null || echo "Banco já existe"
        npm run migrate
    fi
    
    echo -e "${GREEN}✅ Banco configurado${NC}"
}

# Função para instalar dependências
install_dependencies() {
    echo -e "${BLUE}📦 Instalando dependências...${NC}"
    
    if [ -f package-lock.json ]; then
        npm ci
    else
        npm install
    fi
    
    echo -e "${GREEN}✅ Dependências instaladas${NC}"
}

# Função para executar testes
run_tests() {
    if [ -f "package.json" ] && grep -q "\"test\":" package.json; then
        echo -e "${BLUE}🧪 Executando testes...${NC}"
        npm test
        echo -e "${GREEN}✅ Testes passaram${NC}"
    else
        echo -e "${YELLOW}⚠️  Nenhum teste configurado${NC}"
    fi
}

# Função para build da aplicação
build_application() {
    echo -e "${BLUE}🔨 Fazendo build da aplicação...${NC}"
    
    # Se houver script de build
    if grep -q "\"build\":" package.json; then
        npm run build
    fi
    
    echo -e "${GREEN}✅ Build concluído${NC}"
}

# Função para deploy via Docker
deploy_docker() {
    echo -e "${BLUE}🐳 Deploy via Docker...${NC}"
    
    # Build das imagens
    docker-compose build
    
    # Subir serviços
    docker-compose up -d
    
    # Aguardar serviços estarem prontos
    echo "Aguardando serviços..."
    sleep 15
    
    # Verificar se tudo está funcionando
    if curl -f http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Deploy via Docker concluído${NC}"
        echo -e "${GREEN}🌐 Aplicação disponível em: http://localhost${NC}"
    else
        echo -e "${RED}❌ Falha no deploy Docker${NC}"
        docker-compose logs
        exit 1
    fi
}

# Função para deploy local
deploy_local() {
    echo -e "${BLUE}🏠 Deploy local...${NC}"
    
    # Gerar chave JWT se não existir
    if ! grep -q "JWT_SECRET=" .env || grep -q "JWT_SECRET=$" .env; then
        echo "Gerando chave JWT..."
        JWT_SECRET=$(node scripts/generate-jwt-secret.js | grep "JWT_SECRET=" | cut -d'=' -f2)
        sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
    fi
    
    # Executar seed se necessário
    npm run seed
    
    # Iniciar aplicação
    echo -e "${GREEN}✅ Iniciando aplicação...${NC}"
    echo -e "${GREEN}🌐 Aplicação estará disponível em: http://localhost:3000${NC}"
    echo -e "${YELLOW}💡 Use Ctrl+C para parar${NC}"
    
    npm start
}

# Menu principal
show_menu() {
    echo ""
    echo "Selecione o tipo de deploy:"
    echo "1) Deploy via Docker (recomendado)"
    echo "2) Deploy local (desenvolvimento)"
    echo "3) Apenas configurar banco"
    echo "4) Executar testes"
    echo "5) Sair"
    echo ""
    read -p "Opção [1-5]: " choice
}

# Função principal
main() {
    check_dependencies
    install_dependencies
    
    if [ $# -eq 0 ]; then
        show_menu
        
        case $choice in
            1)
                if [ "$DOCKER_AVAILABLE" = true ]; then
                    setup_database
                    run_tests
                    build_application
                    deploy_docker
                else
                    echo -e "${RED}❌ Docker não está disponível${NC}"
                    exit 1
                fi
                ;;
            2)
                setup_database
                run_tests
                build_application
                deploy_local
                ;;
            3)
                setup_database
                ;;
            4)
                run_tests
                ;;
            5)
                echo "Saindo..."
                exit 0
                ;;
            *)
                echo -e "${RED}❌ Opção inválida${NC}"
                exit 1
                ;;
        esac
    else
        # Argumentos da linha de comando
        case $1 in
            docker)
                setup_database
                run_tests
                build_application
                deploy_docker
                ;;
            local)
                setup_database
                run_tests
                build_application
                deploy_local
                ;;
            db)
                setup_database
                ;;
            test)
                run_tests
                ;;
            *)
                echo "Uso: $0 [docker|local|db|test]"
                exit 1
                ;;
        esac
    fi
}

# Executar função principal
main "$@"

---

#!/bin/bash
# setup.sh - Script de configuração inicial

echo "🔧 AEMOZ - Setup Inicial"
echo "========================"

# Criar estrutura de diretórios
create_directories() {
    echo "Criando diretórios..."
    
    mkdir -p logs
    mkdir -p uploads
    mkdir -p backups
    mkdir -p nginx/ssl
    mkdir -p scripts
    
    echo "✅ Diretórios criados"
}

# Configurar arquivos de exemplo
setup_example_files() {
    echo "Configurando arquivos de exemplo..."
    
    # .env.example
    if [ ! -f .env.example ]; then
        cat > .env.example << 'EOF'
# Copie este arquivo para .env e configure as variáveis

NODE_ENV=development
PORT=3000

# Banco de dados
DATABASE_URL=postgresql://aemoz_user:sua_senha_aqui@localhost:5432/aemoz_db
DB_PASSWORD=sua_senha_segura_aqui

# Segurança
JWT_SECRET=sua_chave_jwt_super_secreta_aqui
ADMIN_PASSWORD=aemoz2025

# Frontend
FRONTEND_URL=http://localhost:3001

# Rate limiting
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
EOF
    fi
    
    # .gitignore
    if [ ! -f .gitignore ]; then
        cat > .gitignore << 'EOF'
# Dependencies
node_modules/
npm-debug.log*

# Environment
.env
.env.local
.env.production

# Logs
logs/
*.log

# Uploads
uploads/

# Backups
backups/

# SSL certificates
nginx/ssl/*.pem
nginx/ssl/*.key

# Database dumps
*.sql.dump

# Docker
.docker/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db
EOF
    fi
    
    echo "✅ Arquivos de exemplo configurados"
}

# Verificar e instalar dependências do sistema
install_system_dependencies() {
    echo "Verificando dependências do sistema..."
    
    # Verificar sistema operacional
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        if command -v apt-get &> /dev/null; then
            # Ubuntu/Debian
            echo "Detectado: Ubuntu/Debian"
            sudo apt-get update
            sudo apt-get install -y curl wget gnupg2 software-properties-common
            
            # PostgreSQL
            if ! command -v psql &> /dev/null; then
                echo "Instalando PostgreSQL..."
                sudo apt-get install -y postgresql postgresql-contrib
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
            fi
            
        elif command -v yum &> /dev/null; then
            # RHEL/CentOS
            echo "Detectado: RHEL/CentOS"
            sudo yum update -y
            sudo yum install -y curl wget
            
            # PostgreSQL
            if ! command -v psql &> /dev/null; then
                echo "Instalando PostgreSQL..."
                sudo yum install -y postgresql-server postgresql-contrib
                sudo postgresql-setup initdb
                sudo systemctl start postgresql
                sudo systemctl enable postgresql
            fi
        fi
        
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        echo "Detectado: macOS"
        
        # Homebrew
        if ! command -v brew &> /dev/null; then
            echo "Instalando Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        
        # PostgreSQL
        if ! command -v psql &> /dev/null; then
            echo "Instalando PostgreSQL..."
            brew install postgresql@15
            brew services start postgresql@15
        fi
    fi
    
    echo "✅ Dependências do sistema verificadas"
}

# Configurar banco de dados local
setup_local_database() {
    echo "Configurando banco de dados local..."
    
    # Configurar usuário PostgreSQL
    sudo -u postgres psql << EOF
CREATE USER aemoz_user WITH ENCRYPTED PASSWORD 'aemoz_secure_2024';
CREATE DATABASE aemoz_db OWNER aemoz_user;
GRANT ALL PRIVILEGES ON DATABASE aemoz_db TO aemoz_user;
ALTER USER aemoz_user CREATEDB;
\q
EOF

    echo "✅ Banco de dados configurado"
    echo "   Usuário: aemoz_user"
    echo "   Banco: aemoz_db"
    echo "   Senha: aemoz_secure_2024"
}

# Configurar Node.js
setup_nodejs() {
    echo "Verificando Node.js..."
    
    if ! command -v node &> /dev/null; then
        echo "Instalando Node.js..."
        
        # Instalar via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        
        # Ou via nvm (alternativa)
        # curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        # source ~/.bashrc
        # nvm install 18
        # nvm use 18
    fi
    
    # Verificar versão
    node_version=$(node -v)
    npm_version=$(npm -v)
    
    echo "✅ Node.js configurado"
    echo "   Node.js: $node_version"
    echo "   npm: $npm_version"
}

# Menu de configuração
setup_menu() {
    echo ""
    echo "Selecione as opções de configuração:"
    echo "1) Configuração completa (recomendado)"
    echo "2) Apenas diretórios e arquivos"
    echo "3) Apenas dependências do sistema"
    echo "4) Apenas banco de dados"
    echo "5) Apenas Node.js"
    echo "6) Sair"
    echo ""
    read -p "Opção [1-6]: " setup_choice
}

# Função principal do setup
main() {
    echo "Iniciando configuração inicial..."
    
    if [ $# -eq 0 ]; then
        setup_menu
        
        case $setup_choice in
            1)
                create_directories
                setup_example_files
                install_system_dependencies
                setup_nodejs
                setup_local_database
                echo ""
                echo "🎉 Configuração completa concluída!"
                echo ""
                echo "Próximos passos:"
                echo "1. Configure o arquivo .env"
                echo "2. Execute: npm install"
                echo "3. Execute: ./deploy.sh"
                ;;
            2)
                create_directories
                setup_example_files
                ;;
            3)
                install_system_dependencies
                ;;
            4)
                setup_local_database
                ;;
            5)
                setup_nodejs
                ;;
            6)
                echo "Saindo..."
                exit 0
                ;;
            *)
                echo "Opção inválida"
                exit 1
                ;;
        esac
    else
        # Argumentos da linha de comando
        case $1 in
            full)
                create_directories
                setup_example_files
                install_system_dependencies
                setup_nodejs
                setup_local_database
                ;;
            dirs)
                create_directories
                setup_example_files
                ;;
            deps)
                install_system_dependencies
                ;;
            db)
                setup_local_database
                ;;
            node)
                setup_nodejs
                ;;
            *)
                echo "Uso: $0 [full|dirs|deps|db|node]"
                exit 1
                ;;
        esac
    fi
}

# Verificar se é root para operações de sistema
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Não execute este script como root"
    echo "   O script solicitará sudo quando necessário"
    exit 1
fi

main "$@"

---

#!/bin/bash
# production-deploy.sh - Deploy para produção

set -e

echo "🚀 AEMOZ - Deploy para Produção"
echo "================================"

# Verificar se está no branch correto
check_git_branch() {
    current_branch=$(git branch --show-current)
    if [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
        echo "⚠️  Você está no branch '$current_branch'"
        read -p "Continuar mesmo assim? (y/N): " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            exit 1
        fi
    fi
}

# Executar testes
run_production_tests() {
    echo "🧪 Executando testes..."
    
    # Definir ambiente de teste
    export NODE_ENV=test
    
    npm test
    
    echo "✅ Todos os testes passaram"
}

# Build para produção
production_build() {
    echo "🔨 Build para produção..."
    
    export NODE_ENV=production
    
    # Limpar node_modules e reinstalar
    rm -rf node_modules
    npm ci --only=production
    
    echo "✅ Build de produção concluído"
}

# Deploy via Docker para produção
docker_production_deploy() {
    echo "🐳 Deploy Docker para produção..."
    
    # Build da imagem de produção
    docker build -t aemoz-backend:latest .
    
    # Tag para registry (se aplicável)
    if [ ! -z "$DOCKER_REGISTRY" ]; then
        docker tag aemoz-backend:latest $DOCKER_REGISTRY/aemoz-backend:latest
        docker push $DOCKER_REGISTRY/aemoz-backend:latest
    fi
    
    # Deploy com docker-compose de produção
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
    
    echo "✅ Deploy Docker concluído"
}

# Deploy para Railway
railway_deploy() {
    echo "🚂 Deploy para Railway..."
    
    if ! command -v railway &> /dev/null; then
        echo "Instalando Railway CLI..."
        npm install -g @railway/cli
    fi
    
    # Login (se necessário)
    railway login
    
    # Deploy
    railway up
    
    echo "✅ Deploy Railway concluído"
}

# Deploy para Vercel
vercel_deploy() {
    echo "▲ Deploy para Vercel..."
    
    if ! command -v vercel &> /dev/null; then
        echo "Instalando Vercel CLI..."
        npm install -g vercel
    fi
    
    # Deploy
    vercel --prod
    
    echo "✅ Deploy Vercel concluído"
}

# Deploy para Heroku
heroku_deploy() {
    echo "🟣 Deploy para Heroku..."
    
    if ! command -v heroku &> /dev/null; then
        echo "Instalando Heroku CLI..."
        curl https://cli-assets.heroku.com/install.sh | sh
    fi
    
    # Login (se necessário)
    heroku login
    
    # Push
    git push heroku main
    
    echo "✅ Deploy Heroku concluído"
}

# Menu de deploy
deploy_menu() {
    echo ""
    echo "Selecione a plataforma de deploy:"
    echo "1) Docker (servidor próprio)"
    echo "2) Railway"
    echo "3) Vercel"
    echo "4) Heroku"
    echo "5) Apenas build"
    echo "6) Sair"
    echo ""
    read -p "Opção [1-6]: " deploy_choice
}

# Função principal
main() {
    check_git_branch
    run_production_tests
    production_build
    
    if [ $# -eq 0 ]; then
        deploy_menu
        
        case $deploy_choice in
            1)
                docker_production_deploy
                ;;
            2)
                railway_deploy
                ;;
            3)
                vercel_deploy
                ;;
            4)
                heroku_deploy
                ;;
            5)
                echo "✅ Build concluído"
                ;;
            6)
                echo "Saindo..."
                exit 0
                ;;
            *)
                echo "Opção inválida"
                exit 1
                ;;
        esac
    else
        case $1 in
            docker)
                docker_production_deploy
                ;;
            railway)
                railway_deploy
                ;;
            vercel)
                vercel_deploy
                ;;
            heroku)
                heroku_deploy
                ;;
            build)
                echo "✅ Build concluído"
                ;;
            *)
                echo "Uso: $0 [docker|railway|vercel|heroku|build]"
                exit 1
                ;;
        esac
    fi
    
    echo ""
    echo "🎉 Deploy concluído com sucesso!"
    echo ""
    echo "📋 Não se esqueça de:"
    echo "• Verificar se a aplicação está funcionando"
    echo "• Configurar domínio e SSL"
    echo "• Configurar monitoramento"
    echo "• Fazer backup do banco de dados"
}

main "$@"
FROM node:18-alpine

# Instalar dependências do sistema
RUN apk add --no-cache postgresql-client dumb-init

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production && npm cache clean --force

# Copiar código da aplicação
COPY . .

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S aemoz -u 1001 -G nodejs

# Criar diretórios necessários
RUN mkdir -p logs && \
    chown -R aemoz:nodejs /app

USER aemoz

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node healthcheck.js || exit 1

# Comando de inicialização com dumb-init para melhor gerenciamento de sinais
CMD ["dumb-init", "node", "server.js"]
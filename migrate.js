require('dotenv').config({ path: './.env' });
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL não está definida no arquivo .env');
    process.exit(1);
  }

  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false // Necessário para Neon com sslmode=require
    }
  });

  try {
    await client.connect();
    console.log('Conectado ao banco de dados.');

    const initSqlPath = path.join(__dirname, '../init.sql');
    const initSql = fs.readFileSync(initSqlPath, 'utf8');

    console.log('Executando init.sql...');
    await client.query(initSql);
    console.log('init.sql executado com sucesso.');

  } catch (err) {
    console.error('Erro ao executar migrações:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('Conexão com o banco de dados encerrada.');
  }
}

runMigrations();


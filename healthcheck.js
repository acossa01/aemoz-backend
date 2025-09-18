// healthcheck.js
const http = require('http');
const { Pool } = require('pg');

const healthCheck = async () => {
    try {
        // Verificar se o servidor está respondendo
        const serverCheck = new Promise((resolve, reject) => {
            const req = http.request({
                host: 'localhost',
                port: 3000,
                path: '/api/health',
                timeout: 5000
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve('Server OK');
                } else {
                    reject(new Error(`Server returned ${res.statusCode}`));
                }
            });
            
            req.on('error', reject);
            req.on('timeout', () => reject(new Error('Server timeout')));
            req.end();
        });

        await serverCheck;

        // Verificar conexão com banco de dados
        const pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 1,
            connectionTimeoutMillis: 5000
        });

        await pool.query('SELECT 1');
        await pool.end();

        console.log('Health check passed');
        process.exit(0);
        
    } catch (error) {
        console.error('Health check failed:', error.message);
        process.exit(1);
    }
};

healthCheck();

---

// scripts/migrate.js
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const migrate = async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔄 Executando migrações...');

        // Ler arquivo de migração
        const migrationPath = path.join(__dirname, 'init.sql');
        const migrationSQL = await fs.readFile(migrationPath, 'utf8');

        // Executar migração
        await pool.query(migrationSQL);

        console.log('✅ Migrações executadas com sucesso!');

        // Verificar estrutura
        const result = await pool.query(`
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'aemoz' OR table_schema = 'public'
            ORDER BY table_name, ordinal_position
        `);

        console.log('\n📊 Estrutura do banco:');
        let currentTable = '';
        result.rows.forEach(row => {
            if (row.table_name !== currentTable) {
                currentTable = row.table_name;
                console.log(`\n${row.table_name}:`);
            }
            console.log(`  - ${row.column_name} (${row.data_type})`);
        });

    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    migrate();
}

module.exports = migrate;

---

// scripts/seed.js
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const seed = async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🌱 Executando seed...');

        // Ler arquivo de seed
        const seedPath = path.join(__dirname, 'seed.sql');
        const seedSQL = await fs.readFile(seedPath, 'utf8');

        // Executar seed
        await pool.query(seedSQL);

        console.log('✅ Seed executado com sucesso!');

        // Mostrar estatísticas
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM participants) as participants,
                (SELECT COUNT(*) FROM courses) as courses,
                (SELECT COUNT(*) FROM groups) as groups
        `);

        console.log('\n📊 Dados inseridos:');
        console.log(`  - Participantes: ${stats.rows[0].participants}`);
        console.log(`  - Cursos: ${stats.rows[0].courses}`);
        console.log(`  - Grupos: ${stats.rows[0].groups}`);

    } catch (error) {
        console.error('❌ Erro no seed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    seed();
}

module.exports = seed;

---

// scripts/backup.js
const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

const createBackup = async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('💾 Criando backup...');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '..', 'backups');
        
        // Criar diretório de backup se não existir
        try {
            await fs.mkdir(backupDir, { recursive: true });
        } catch (error) {
            // Diretório já existe
        }

        // Backup dos participantes
        const participants = await pool.query('SELECT * FROM participants ORDER BY created_at');
        await fs.writeFile(
            path.join(backupDir, `participants_${timestamp}.json`),
            JSON.stringify(participants.rows, null, 2)
        );

        // Backup dos grupos
        const groups = await pool.query(`
            SELECT 
                g.*,
                json_agg(
                    json_build_object(
                        'participant_id', gm.participant_id,
                        'participant_name', p.nome,
                        'participant_course', p.curso,
                        'position', gm.position
                    ) ORDER BY gm.position
                ) as members
            FROM groups g
            LEFT JOIN group_members gm ON g.id = gm.group_id
            LEFT JOIN participants p ON gm.participant_id = p.id
            GROUP BY g.id
            ORDER BY g.created_at
        `);

        await fs.writeFile(
            path.join(backupDir, `groups_${timestamp}.json`),
            JSON.stringify(groups.rows, null, 2)
        );

        // Backup das estatísticas
        const stats = await pool.query('SELECT * FROM backup_critical_data()');
        await fs.writeFile(
            path.join(backupDir, `stats_${timestamp}.json`),
            JSON.stringify(stats.rows, null, 2)
        );

        console.log(`✅ Backup criado em: backups/`);
        console.log(`   - participants_${timestamp}.json`);
        console.log(`   - groups_${timestamp}.json`);
        console.log(`   - stats_${timestamp}.json`);

    } catch (error) {
        console.error('❌ Erro no backup:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    createBackup();
}

module.exports = createBackup;

---

// scripts/cleanup.js
const { Pool } = require('pg');

const cleanup = async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🧹 Executando limpeza...');

        // Limpar sessões expiradas
        const expiredSessions = await pool.query('SELECT cleanup_expired_sessions()');
        console.log(`✅ Removidas ${expiredSessions.rows[0].cleanup_expired_sessions} sessões expiradas`);

        // Limpar logs de auditoria antigos (mais de 30 dias)
        const oldLogs = await pool.query(`
            DELETE FROM audit_logs 
            WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
            RETURNING COUNT(*)
        `);
        console.log(`✅ Removidos ${oldLogs.rowCount} logs antigos`);

        // Estatísticas finais
        const stats = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM participants WHERE ativo = TRUE) as active_participants,
                (SELECT COUNT(*) FROM groups WHERE ativo = TRUE) as active_groups,
                (SELECT COUNT(*) FROM admin_sessions WHERE expires_at > CURRENT_TIMESTAMP) as active_sessions,
                (SELECT COUNT(*) FROM audit_logs) as audit_logs
        `);

        console.log('\n📊 Estado atual:');
        console.log(`  - Participantes ativos: ${stats.rows[0].active_participants}`);
        console.log(`  - Grupos ativos: ${stats.rows[0].active_groups}`);
        console.log(`  - Sessões ativas: ${stats.rows[0].active_sessions}`);
        console.log(`  - Logs de auditoria: ${stats.rows[0].audit_logs}`);

    } catch (error) {
        console.error('❌ Erro na limpeza:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    cleanup();
}

module.exports = cleanup;

---

// scripts/generate-jwt-secret.js
const crypto = require('crypto');

const generateJWTSecret = () => {
    const secret = crypto.randomBytes(64).toString('hex');
    console.log('🔐 Nova chave JWT gerada:');
    console.log('');
    console.log(`JWT_SECRET=${secret}`);
    console.log('');
    console.log('📋 Copie esta linha para seu arquivo .env');
    console.log('⚠️  IMPORTANTE: Mantenha esta chave em segurança!');
    
    return secret;
};

if (require.main === module) {
    generateJWTSecret();
}

module.exports = generateJWTSecret;
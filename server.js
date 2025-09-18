require('dotenv').config();

// ---- ADICIONE ESTE BLOCO PARA DEBUG ----
console.log('--- Verificando Variáveis de Ambiente ---');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_PORT:', process.env.DB_PORT);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '****** (SENHA CARREGADA)' : '!!! UNDEFINED !!!');
console.log('------------------------------------');
// -----------------------------------------

// O resto do seu código (const express = require('express'); etc.)
// deve vir DEPOIS desta linha.

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { Pool } = require('pg');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// ========== CONFIGURAÇÃO DO BANCO DE DADOS ==========
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Necessário para Neon
  }
});

// ========== MIDDLEWARE DE SEGURANÇA ==========
/*
//app.use(helmet());
const corsOptions = {
  origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : 'http://localhost:3001',
  credentials: true,
  optionsSuccessStatus: 200
};

// Linha de diagnóstico
console.log('--- Configuração do CORS Carregada ---');
console.log(corsOptions.origin);
console.log('------------------------------------');

app.use(cors(corsOptions)); */

// SUBSTITUA O BLOCO ANTERIOR POR ESTE, APENAS PARA TESTE
console.log('--- ATENÇÃO: CORS LIBERADO PARA TODOS (MODO DE TESTE) ---');
app.use(cors({
  origin: '*', // Isso permite QUALQUER origem
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // máximo 5 tentativas de login por IP
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ========== MIDDLEWARE DE AUTENTICAÇÃO ==========
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// ========== INICIALIZAÇÃO DO BANCO ==========
const initDatabase = async () => {
  try {
    await pool.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      
      CREATE TABLE IF NOT EXISTS participants (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        curso VARCHAR(255) NOT NULL,
        semestre INTEGER NOT NULL CHECK (semestre >= 1 AND semestre <= 10),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(nome, curso)
      );

      CREATE TABLE IF NOT EXISTS groups (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        nome VARCHAR(100) NOT NULL,
        cor VARCHAR(7) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS group_members (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
        participant_id UUID REFERENCES participants(id) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(participant_id)
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        session_token VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_participants_curso ON participants(curso);
      CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at);
      CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at);
      CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
    `);
    console.log('✅ Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
    process.exit(1);
  }
};

// ========== ENDPOINTS PÚBLICOS ==========

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Estatísticas públicas
app.get('/api/stats', async (req, res) => {
  try {
    const participantsResult = await pool.query('SELECT COUNT(*) as count FROM participants');
    const coursesResult = await pool.query('SELECT COUNT(DISTINCT curso) as count FROM participants');
    const groupsResult = await pool.query('SELECT COUNT(*) as count FROM groups');

    res.json({
      participants: parseInt(participantsResult.rows[0].count),
      courses: parseInt(coursesResult.rows[0].count),
      groups: parseInt(groupsResult.rows[0].count)
    });
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Cadastro de participante
app.post('/api/participants', async (req, res) => {
  try {
    const { nome, curso, semestre } = req.body;

    // Validações
    if (!nome || !curso || !semestre) {
      return res.status(400).json({ 
        error: 'Todos os campos são obrigatórios',
        fields: { nome: !nome, curso: !curso, semestre: !semestre }
      });
    }

    if (nome.trim().length < 3) {
      return res.status(400).json({ error: 'Nome deve ter pelo menos 3 caracteres' });
    }

    const semestreNum = parseInt(semestre);
    if (semestreNum < 1 || semestreNum > 10) {
      return res.status(400).json({ error: 'Semestre deve estar entre 1 e 10' });
    }

    // Verificar duplicatas
    const existingResult = await pool.query(
      'SELECT id FROM participants WHERE LOWER(nome) = LOWER($1) AND curso = $2',
      [nome.trim(), curso]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({ 
        error: 'Já exists um participante com esse nome neste curso' 
      });
    }

    // Inserir participante
    const result = await pool.query(
      `INSERT INTO participants (nome, curso, semestre) 
       VALUES ($1, $2, $3) 
       RETURNING id, nome, curso, semestre, created_at`,
      [nome.trim(), curso, semestreNum]
    );

    res.status(201).json({
      message: 'Participante cadastrado com sucesso',
      participant: result.rows[0]
    });

  } catch (error) {
    console.error('Erro ao cadastrar participante:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========== AUTENTICAÇÃO ==========
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Senha é obrigatória' });
    }

    const adminPassword = process.env.ADMIN_PASSWORD || 'aemoz2025';
    
    // Usar bcrypt em produção - aqui é comparação simples para compatibilidade
    const isValid = password === adminPassword;

    if (!isValid) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { role: 'admin', timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login realizado com sucesso',
      token,
      expiresIn: '8h'
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Validar token
app.get('/api/auth/validate', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ========== ENDPOINTS ADMINISTRATIVOS ==========

// Listar participantes
app.get('/api/admin/participants', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, curso } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT id, nome, curso, semestre, created_at, updated_at
      FROM participants
    `;
    let params = [];
    
    if (curso) {
      query += ' WHERE curso = $1';
      params.push(curso);
    }
    
    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await pool.query(query, params);
    
    // Contar total
    const countQuery = curso ? 
      'SELECT COUNT(*) FROM participants WHERE curso = $1' : 
      'SELECT COUNT(*) FROM participants';
    const countParams = curso ? [curso] : [];
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      participants: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].count),
        totalPages: Math.ceil(countResult.rows[0].count / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao buscar participantes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Participantes por curso (para estatísticas)
app.get('/api/admin/participants/by-course', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT curso, COUNT(*) as count, 
             array_agg(json_build_object('id', id, 'nome', nome, 'semestre', semestre)) as participants
      FROM participants 
      GROUP BY curso 
      ORDER BY count DESC, curso
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('Erro ao buscar participantes por curso:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Excluir participante
app.delete('/api/admin/participants/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se existe
    const existingResult = await pool.query('SELECT nome, curso FROM participants WHERE id = $1', [id]);
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Excluir (CASCADE irá remover de group_members também)
    await pool.query('DELETE FROM participants WHERE id = $1', [id]);

    res.json({ 
      message: 'Participante excluído com sucesso',
      participant: existingResult.rows[0]
    });

  } catch (error) {
    console.error('Erro ao excluir participante:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Realizar sorteio
app.post('/api/admin/sorteio', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Buscar participantes
    const participantsResult = await client.query(`
      SELECT id, nome, curso, semestre 
      FROM participants 
      ORDER BY curso, nome
    `);

    const participants = participantsResult.rows;
    
    if (participants.length < 16) {
      return res.status(400).json({ 
        error: 'Mínimo de 16 participantes necessários para sorteio',
        current: participants.length 
      });
    }

    // Verificar diversidade de cursos
    const coursesResult = await client.query('SELECT DISTINCT curso FROM participants');
    if (coursesResult.rows.length < 4) {
      return res.status(400).json({ 
        error: 'Mínimo de 4 cursos diferentes necessários',
        current: coursesResult.rows.length 
      });
    }

    // Limpar grupos anteriores
    await client.query('DELETE FROM group_members');
    await client.query('DELETE FROM groups');

    // Embaralhar participantes
    const shuffled = participants.sort(() => Math.random() - 0.5);
    const totalGroups = Math.floor(shuffled.length / 4);
    
    const cores = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
      '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD',
      '#00D2D3', '#FF9F43', '#8C7AE6', '#00A8FF'
    ];

    const grupos = [];

    // Criar grupos
    for (let i = 0; i < totalGroups; i++) {
      const groupName = `Grupo ${i + 1}`;
      const cor = cores[i % cores.length];
      
      // Inserir grupo
      const groupResult = await client.query(
        'INSERT INTO groups (nome, cor) VALUES ($1, $2) RETURNING id',
        [groupName, cor]
      );
      
      const groupId = groupResult.rows[0].id;
      const membros = [];

      // Adicionar 4 membros ao grupo
      for (let j = 0; j < 4; j++) {
        const memberIndex = i * 4 + j;
        if (memberIndex < shuffled.length) {
          const participant = shuffled[memberIndex];
          
          await client.query(
            'INSERT INTO group_members (group_id, participant_id) VALUES ($1, $2)',
            [groupId, participant.id]
          );
          
          membros.push(participant);
        }
      }

      grupos.push({
        id: groupId,
        nome: groupName,
        cor,
        membros
      });
    }

    await client.query('COMMIT');

    res.json({
      message: 'Sorteio realizado com sucesso',
      grupos,
      stats: {
        totalParticipants: shuffled.length,
        totalGroups,
        participantsInGroups: totalGroups * 4,
        remainingParticipants: shuffled.length - (totalGroups * 4)
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro no sorteio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// Buscar resultado do sorteio
app.get('/api/admin/sorteio/result', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        g.id, g.nome, g.cor, g.created_at,
        json_agg(
          json_build_object(
            'id', p.id,
            'nome', p.nome,
            'curso', p.curso,
            'semestre', p.semestre
          ) ORDER BY p.nome
        ) as membros
      FROM groups g
      LEFT JOIN group_members gm ON g.id = gm.group_id
      LEFT JOIN participants p ON gm.participant_id = p.id
      GROUP BY g.id, g.nome, g.cor, g.created_at
      ORDER BY g.nome
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum sorteio realizado ainda' });
    }

    res.json({
      grupos: result.rows.map(row => ({
        ...row,
        membros: row.membros.filter(m => m.id !== null) // Remove membros nulos
      })),
      sorteio_em: result.rows[0].created_at
    });

  } catch (error) {
    console.error('Erro ao buscar resultado do sorteio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpar todos os dados
app.delete('/api/admin/clear-all', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    await client.query('DELETE FROM group_members');
    await client.query('DELETE FROM groups');
    await client.query('DELETE FROM participants');
    
    await client.query('COMMIT');

    res.json({ message: 'Todos os dados foram removidos com sucesso' });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao limpar dados:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// ========== DADOS DE TESTE ==========
app.post('/api/admin/test-data', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const testParticipants = [
      // Administração Pública (4)
      {nome: 'Ana Silva', curso: 'Administração Pública', semestre: 3},
      {nome: 'Bruno Santos', curso: 'Administração Pública', semestre: 5},
      {nome: 'Carlos Mendes', curso: 'Administração Pública', semestre: 2},
      {nome: 'Diana Costa', curso: 'Administração Pública', semestre: 4},
      
      // Medicina (4)
      {nome: 'Eduardo Lima', curso: 'Medicina', semestre: 6},
      {nome: 'Fernanda Rocha', curso: 'Medicina', semestre: 4},
      {nome: 'Gabriel Teixeira', curso: 'Medicina', semestre: 8},
      {nome: 'Helena Martins', curso: 'Medicina', semestre: 2},
      
      // Engenharia de Computação (4)
      {nome: 'Igor Pereira', curso: 'Engenharia de Computação', semestre: 3},
      {nome: 'Julia Fernandes', curso: 'Engenharia de Computação', semestre: 5},
      {nome: 'Kevin Alves', curso: 'Engenharia de Computação', semestre: 7},
      {nome: 'Laura Oliveira', curso: 'Engenharia de Computação', semestre: 1},
      
      // Relações Internacionais (4)
      {nome: 'Marcos Souza', curso: 'Relações Internacionais', semestre: 4},
      {nome: 'Nina Cardoso', curso: 'Relações Internacionais', semestre: 6},
      {nome: 'Otávio Reis', curso: 'Relações Internacionais', semestre: 2},
      {nome: 'Paula Gomes', curso: 'Relações Internacionais', semestre: 8},
      
      // Extras
      {nome: 'Ricardo Barbosa', curso: 'Administração Pública', semestre: 7},
      {nome: 'Sofia Campos', curso: 'Medicina', semestre: 3},
      {nome: 'Thiago Azevedo', curso: 'Engenharia de Computação', semestre: 4},
      {nome: 'Vitória Nascimento', curso: 'Relações Internacionais', semestre: 5},
    ];

    let addedCount = 0;
    
    for (const participant of testParticipants) {
      try {
        await client.query(
          'INSERT INTO participants (nome, curso, semestre) VALUES ($1, $2, $3)',
          [participant.nome, participant.curso, participant.semestre]
        );
        addedCount++;
      } catch (error) {
        // Ignorar duplicatas
        if (error.code !== '23505') {
          throw error;
        }
      }
    }

    await client.query('COMMIT');

    res.json({ 
      message: `${addedCount} participantes de teste adicionados com sucesso`,
      added: addedCount,
      total: testParticipants.length
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Erro ao adicionar dados de teste:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  } finally {
    client.release();
  }
});

// ========== ENDPOINTS PARA GERAÇÃO DE PDF ==========

// Gerar PDF da lista de participantes
app.get('/api/admin/pdf/participants', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT curso, COUNT(*) as count, 
             array_agg(json_build_object('id', id, 'nome', nome, 'semestre', semestre) ORDER BY nome) as participants
      FROM participants 
      GROUP BY curso 
      ORDER BY count DESC, curso
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum participante encontrado' });
    }

    // Criar documento PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Configurar headers para download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="lista-participantes.pdf"');
    
    // Pipe do documento para a resposta
    doc.pipe(res);

    // Título do documento
    doc.fontSize(20).text('AEMOZ - Lista de Participantes', { align: 'center' });
    doc.fontSize(14).text('Associação dos Estudantes Moçambicanos - UNILAB', { align: 'center' });
    doc.moveDown(2);

    // Data de geração
    const now = new Date();
    doc.fontSize(10).text(`Gerado em: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`, { align: 'right' });
    doc.moveDown(1);

    // Estatísticas gerais
    const totalParticipants = result.rows.reduce((sum, course) => sum + parseInt(course.count), 0);
    doc.fontSize(12).text(`Total de Participantes: ${totalParticipants}`, { align: 'left' });
    doc.text(`Total de Cursos: ${result.rows.length}`, { align: 'left' });
    doc.moveDown(2);

    // Lista por curso
    result.rows.forEach((course, courseIndex) => {
      // Verificar se há espaço suficiente na página
      if (doc.y > 700) {
        doc.addPage();
      }

      // Nome do curso
      doc.fontSize(14).fillColor('#2563eb').text(`${course.curso} (${course.count} participantes)`, { underline: true });
      doc.fillColor('black').moveDown(0.5);

      // Lista de participantes
      course.participants.forEach((participant, index) => {
        if (doc.y > 750) {
          doc.addPage();
        }
        
        doc.fontSize(10).text(`${index + 1}. ${participant.nome} - ${participant.semestre}º semestre`, { indent: 20 });
      });

      doc.moveDown(1);
    });

    // Finalizar documento
    doc.end();

  } catch (error) {
    console.error('Erro ao gerar PDF de participantes:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Gerar PDF dos resultados do sorteio
app.get('/api/admin/pdf/groups', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        g.id, g.nome, g.cor, g.created_at,
        json_agg(
          json_build_object(
            'id', p.id,
            'nome', p.nome,
            'curso', p.curso,
            'semestre', p.semestre
          ) ORDER BY p.nome
        ) as membros
      FROM groups g
      LEFT JOIN group_members gm ON g.id = gm.group_id
      LEFT JOIN participants p ON gm.participant_id = p.id
      GROUP BY g.id, g.nome, g.cor, g.created_at
      ORDER BY g.nome
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Nenhum sorteio realizado ainda' });
    }

    // Criar documento PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Configurar headers para download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="resultado-sorteio.pdf"');
    
    // Pipe do documento para a resposta
    doc.pipe(res);

    // Título do documento
    doc.fontSize(20).text('AEMOZ - Resultado do Sorteio', { align: 'center' });
    doc.fontSize(14).text('Associação dos Estudantes Moçambicanos - UNILAB', { align: 'center' });
    doc.moveDown(2);

    // Data do sorteio
    const sorteioDate = new Date(result.rows[0].created_at);
    doc.fontSize(12).text(`Sorteio realizado em: ${sorteioDate.toLocaleDateString('pt-BR')} às ${sorteioDate.toLocaleTimeString('pt-BR')}`, { align: 'center' });
    doc.moveDown(1);

    // Estatísticas
    const totalGroups = result.rows.length;
    const totalParticipants = result.rows.reduce((sum, group) => sum + group.membros.filter(m => m.id !== null).length, 0);
    doc.text(`Total de Grupos: ${totalGroups}`, { align: 'left' });
    doc.text(`Total de Participantes: ${totalParticipants}`, { align: 'left' });
    doc.moveDown(2);

    // Lista de grupos
    result.rows.forEach((group, groupIndex) => {
      // Verificar se há espaço suficiente na página
      if (doc.y > 650) {
        doc.addPage();
      }

      // Nome do grupo
      doc.fontSize(16).fillColor('#2563eb').text(group.nome, { underline: true });
      doc.fillColor('black').moveDown(0.5);

      // Membros do grupo
      const membros = group.membros.filter(m => m.id !== null);
      membros.forEach((membro, index) => {
        if (doc.y > 750) {
          doc.addPage();
        }
        
        doc.fontSize(12).text(`${index + 1}. ${membro.nome}`, { indent: 20 });
        doc.fontSize(10).fillColor('#666').text(`   ${membro.curso} - ${membro.semestre}º semestre`, { indent: 20 });
        doc.fillColor('black');
      });

      doc.moveDown(1.5);
    });

    // Finalizar documento
    doc.end();

  } catch (error) {
    console.error('Erro ao gerar PDF de grupos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========== TRATAMENTO DE ERROS ==========
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

app.use((error, req, res, next) => {
  console.error('Erro não tratado:', error);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// ========== INICIALIZAÇÃO ==========
const startServer = async () => {
  try {
    await initDatabase();
    
    app.listen(port, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${port}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 API Base URL: http://0.0.0.0:${port}/api`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await pool.end();
  process.exit(0);
});

startServer();
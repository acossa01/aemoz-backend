require('dotenv').config();
console.log("Server_prisma.js iniciado!");

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const PDFDocument = require('pdfkit');
const { PrismaClient } = require('./generated/prisma');

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

// ========== MIDDLEWARE DE SEGURANÇA ==========
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

// ========== ENDPOINTS PÚBLICOS ==========

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message });
  }
});

// Estatísticas públicas
app.get('/api/stats', async (req, res) => {
  try {
    const participants = await prisma.participant.count();
    const courses = await prisma.participant.groupBy({
      by: ['curso'],
      _count: true
    });
    const groups = await prisma.group.count();

    res.json({
      participants,
      courses: courses.length,
      groups
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
    const existing = await prisma.participant.findFirst({
      where: {
        nome: {
          equals: nome.trim(),
          mode: 'insensitive'
        },
        curso: curso
      }
    });

    if (existing) {
      return res.status(409).json({ 
        error: 'Já existe um participante com esse nome neste curso' 
      });
    }

    // Inserir participante
    const participant = await prisma.participant.create({
      data: {
        nome: nome.trim(),
        curso,
        semestre: semestreNum
      }
    });

    res.status(201).json({
      message: 'Participante cadastrado com sucesso',
      participant
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
    const skip = (page - 1) * limit;

    const where = curso ? { curso } : {};

    const [participants, total] = await Promise.all([
      prisma.participant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: parseInt(skip),
        take: parseInt(limit)
      }),
      prisma.participant.count({ where })
    ]);

    res.json({
      participants,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
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
    const participantsByCourse = await prisma.participant.groupBy({
      by: ['curso'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    const result = await Promise.all(
      participantsByCourse.map(async (course) => {
        const participants = await prisma.participant.findMany({
          where: { curso: course.curso },
          select: {
            id: true,
            nome: true,
            semestre: true
          },
          orderBy: { nome: 'asc' }
        });

        return {
          curso: course.curso,
          count: course._count.id,
          participants
        };
      })
    );

    res.json(result);
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
    const existing = await prisma.participant.findUnique({
      where: { id },
      select: { nome: true, curso: true }
    });
    
    if (!existing) {
      return res.status(404).json({ error: 'Participante não encontrado' });
    }

    // Excluir (CASCADE irá remover de group_members também)
    await prisma.participant.delete({
      where: { id }
    });

    res.json({ 
      message: 'Participante excluído com sucesso',
      participant: existing
    });

  } catch (error) {
    console.error('Erro ao excluir participante:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Realizar sorteio
app.post('/api/admin/sorteio', authenticateToken, async (req, res) => {
  try {
    // Buscar participantes
    const participants = await prisma.participant.findMany({
      orderBy: [{ curso: 'asc' }, { nome: 'asc' }]
    });
    
    if (participants.length < 16) {
      return res.status(400).json({ 
        error: 'Mínimo de 16 participantes necessários para sorteio',
        current: participants.length 
      });
    }

    // Verificar diversidade de cursos
    const courses = await prisma.participant.groupBy({
      by: ['curso']
    });
    
    if (courses.length < 4) {
      return res.status(400).json({ 
        error: 'Mínimo de 4 cursos diferentes necessários',
        current: courses.length 
      });
    }

    // Usar transação para garantir consistência
    const result = await prisma.$transaction(async (tx) => {
      // Limpar grupos anteriores
      await tx.groupMember.deleteMany();
      await tx.group.deleteMany();

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
        const group = await tx.group.create({
          data: {
            nome: groupName,
            cor
          }
        });
        
        const membros = [];

        // Adicionar 4 membros ao grupo
        for (let j = 0; j < 4; j++) {
          const memberIndex = i * 4 + j;
          if (memberIndex < shuffled.length) {
            const participant = shuffled[memberIndex];
            
            await tx.groupMember.create({
              data: {
                groupId: group.id,
                participantId: participant.id
              }
            });
            
            membros.push(participant);
          }
        }

        grupos.push({
          id: group.id,
          nome: groupName,
          cor,
          membros
        });
      }

      return grupos;
    });

    res.json({
      message: 'Sorteio realizado com sucesso',
      grupos: result,
      stats: {
        totalParticipants: participants.length,
        totalGroups: result.length,
        participantsInGroups: result.length * 4,
        remainingParticipants: participants.length - (result.length * 4)
      }
    });

  } catch (error) {
    console.error('Erro no sorteio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar resultado do sorteio
app.get('/api/admin/sorteio/result', authenticateToken, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      include: {
        groupMembers: {
          include: {
            participant: {
              select: {
                id: true,
                nome: true,
                curso: true,
                semestre: true
              }
            }
          },
          orderBy: {
            participant: {
              nome: 'asc'
            }
          }
        }
      },
      orderBy: { nome: 'asc' }
    });

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Nenhum sorteio realizado ainda' });
    }

    const result = groups.map(group => ({
      id: group.id,
      nome: group.nome,
      cor: group.cor,
      created_at: group.createdAt,
      membros: group.groupMembers.map(gm => gm.participant)
    }));

    res.json({
      grupos: result,
      sorteio_em: groups[0].createdAt
    });

  } catch (error) {
    console.error('Erro ao buscar resultado do sorteio:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpar todos os dados
app.delete('/api/admin/clear-all', authenticateToken, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany();
      await tx.group.deleteMany();
      await tx.participant.deleteMany();
    });

    res.json({ message: 'Todos os dados foram removidos com sucesso' });

  } catch (error) {
    console.error('Erro ao limpar dados:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========== DADOS DE TESTE ==========
app.post('/api/admin/test-data', authenticateToken, async (req, res) => {
  try {
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
        await prisma.participant.create({
          data: participant
        });
        addedCount++;
      } catch (error) {
        // Ignorar duplicatas
        if (error.code !== 'P2002') {
          throw error;
        }
      }
    }

    res.json({ 
      message: `${addedCount} participantes de teste adicionados com sucesso`,
      added: addedCount,
      total: testParticipants.length
    });

  } catch (error) {
    console.error('Erro ao adicionar dados de teste:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ========== ENDPOINTS PARA GERAÇÃO DE PDF ==========

// Gerar PDF da lista de participantes
app.get('/api/admin/pdf/participants', authenticateToken, async (req, res) => {
  try {
    const participantsByCourse = await prisma.participant.groupBy({
      by: ['curso'],
      _count: {
        id: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      }
    });

    if (participantsByCourse.length === 0) {
      return res.status(404).json({ error: 'Nenhum participante encontrado' });
    }

    const result = await Promise.all(
      participantsByCourse.map(async (course) => {
        const participants = await prisma.participant.findMany({
          where: { curso: course.curso },
          select: {
            id: true,
            nome: true,
            semestre: true
          },
          orderBy: { nome: 'asc' }
        });

        return {
          curso: course.curso,
          count: course._count.id,
          participants
        };
      })
    );

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
    const totalParticipants = result.reduce((sum, course) => sum + course.count, 0);
    doc.fontSize(12).text(`Total de Participantes: ${totalParticipants}`, { align: 'left' });
    doc.text(`Total de Cursos: ${result.length}`, { align: 'left' });
    doc.moveDown(2);

    // Lista por curso
    result.forEach((course, courseIndex) => {
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
    const groups = await prisma.group.findMany({
      include: {
        groupMembers: {
          include: {
            participant: {
              select: {
                id: true,
                nome: true,
                curso: true,
                semestre: true
              }
            }
          },
          orderBy: {
            participant: {
              nome: 'asc'
            }
          }
        }
      },
      orderBy: { nome: 'asc' }
    });

    if (groups.length === 0) {
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
    const sorteioDate = new Date(groups[0].createdAt);
    doc.fontSize(12).text(`Sorteio realizado em: ${sorteioDate.toLocaleDateString('pt-BR')} às ${sorteioDate.toLocaleTimeString('pt-BR')}`, { align: 'center' });
    doc.moveDown(1);

    // Estatísticas
    const totalGroups = groups.length;
    const totalParticipants = groups.reduce((sum, group) => sum + group.groupMembers.length, 0);
    doc.text(`Total de Grupos: ${totalGroups}`, { align: 'left' });
    doc.text(`Total de Participantes: ${totalParticipants}`, { align: 'left' });
    doc.moveDown(2);

    // Lista de grupos
    groups.forEach((group, groupIndex) => {
      // Verificar se há espaço suficiente na página
      if (doc.y > 650) {
        doc.addPage();
      }

      // Nome do grupo
      doc.fontSize(16).fillColor('#2563eb').text(group.nome, { underline: true });
      doc.fillColor('black').moveDown(0.5);

      // Membros do grupo
      group.groupMembers.forEach((member, index) => {
        if (doc.y > 750) {
          doc.addPage();
        }
        
        doc.fontSize(12).text(`${index + 1}. ${member.participant.nome}`, { indent: 20 });
        doc.fontSize(10).fillColor('#666').text(`   ${member.participant.curso} - ${member.participant.semestre}º semestre`, { indent: 20 });
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
    // Testar conexão com Prisma
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados via Prisma');
    
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
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Encerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

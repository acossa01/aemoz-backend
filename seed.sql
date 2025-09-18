-- scripts/seed.sql
-- Script para popular o banco com dados iniciais

-- Inserir cursos da UNILAB
INSERT INTO courses (nome, codigo, campus) VALUES
    ('Administração Pública', 'ADMP', 'Palmares'),
    ('Agronomia', 'AGRO', 'Redenção'),
    ('Antropologia', 'ANTR', 'São Francisco do Conde'),
    ('Bacharelado em Humanidades – BHU', 'BHU', 'Redenção'),
    ('Ciências Biológicas – Licenciatura', 'CBIO', 'Redenção'),
    ('Ciências da Natureza e Matemática', 'CNM', 'Redenção'),
    ('Ciências Sociais', 'CSOC', 'Palmares'),
    ('Enfermagem', 'ENFR', 'Redenção'),
    ('Engenharia de Alimentos', 'EALM', 'Redenção'),
    ('Engenharia de Computação', 'ECOM', 'Redenção'),
    ('Engenharia de Energias', 'EENG', 'Redenção'),
    ('Farmácia', 'FARM', 'Redenção'),
    ('Física', 'FISI', 'Redenção'),
    ('História', 'HIST', 'Palmares'),
    ('Letras – Língua Portuguesa', 'LPOR', 'Redenção'),
    ('Letras – Língua Inglesa', 'LING', 'Redenção'),
    ('Licenciatura em Educação Escolar Quilombola', 'LEEQ', 'São Francisco do Conde'),
    ('Licenciatura Intercultural Indígena', 'LICI', 'Redenção'),
    ('Matemática – Licenciatura', 'MLIC', 'Redenção'),
    ('Medicina', 'MEDI', 'Redenção'),
    ('Pedagogia – Licenciatura', 'PEDA', 'Palmares'),
    ('Química – Licenciatura', 'QLIC', 'Redenção'),
    ('Relações Internacionais', 'RINT', 'Palmares'),
    ('Serviço Social', 'SSOC', 'Palmares'),
    ('Sociologia – Licenciatura', 'SLIC', 'Palmares')
ON CONFLICT (nome) DO NOTHING;

-- Função para gerar dados de teste (apenas se necessário)
CREATE OR REPLACE FUNCTION generate_test_data()
RETURNS TEXT AS $$
DECLARE
    curso_names TEXT[] := ARRAY[
        'Administração Pública', 'Medicina', 'Engenharia de Computação', 
        'Relações Internacionais', 'Enfermagem', 'Farmácia'
    ];
    first_names TEXT[] := ARRAY[
        'Ana', 'Bruno', 'Carlos', 'Diana', 'Eduardo', 'Fernanda',
        'Gabriel', 'Helena', 'Igor', 'Julia', 'Kevin', 'Laura',
        'Marcos', 'Nina', 'Otávio', 'Paula', 'Ricardo', 'Sofia',
        'Thiago', 'Vitória', 'William', 'Yasmin', 'Zeca', 'Alice'
    ];
    last_names TEXT[] := ARRAY[
        'Silva', 'Santos', 'Mendes', 'Costa', 'Lima', 'Rocha',
        'Teixeira', 'Martins', 'Pereira', 'Fernandes', 'Alves',
        'Oliveira', 'Souza', 'Cardoso', 'Reis', 'Gomes',
        'Barbosa', 'Campos', 'Azevedo', 'Nascimento'
    ];
    participant_count INTEGER := 0;
    curso_name TEXT;
    full_name TEXT;
BEGIN
    -- Inserir participantes de teste apenas se a tabela estiver vazia
    IF (SELECT COUNT(*) FROM participants) = 0 THEN
        FOR i IN 1..100 LOOP
            curso_name := curso_names[1 + (i % array_length(curso_names, 1))];
            full_name := first_names[1 + ((i * 7) % array_length(first_names, 1))] || ' ' ||
                        last_names[1 + ((i * 3) % array_length(last_names, 1))];
            
            BEGIN
                INSERT INTO participants (nome, curso, semestre)
                VALUES (
                    full_name,
                    curso_name,
                    1 + (i % 10)
                );
                participant_count := participant_count + 1;
            EXCEPTION WHEN unique_violation THEN
                -- Ignorar duplicatas
            END;
        END LOOP;
        
        RETURN 'Dados de teste gerados: ' || participant_count || ' participantes';
    ELSE
        RETURN 'Dados já existem, nenhum dado de teste foi inserido';
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Inserir configurações do sistema (opcional)
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO system_config (key, value, description) VALUES
    ('app_name', 'AEMOZ Sistema de Sorteio', 'Nome da aplicação'),
    ('app_version', '1.0.0', 'Versão atual da aplicação'),
    ('max_participants_per_group', '4', 'Número máximo de participantes por grupo'),
    ('min_participants_for_draw', '16', 'Mínimo de participantes para realizar sorteio'),
    ('min_courses_for_draw', '4', 'Mínimo de cursos diferentes para sorteio'),
    ('session_timeout_hours', '8', 'Tempo de expiração da sessão admin em horas'),
    ('enable_audit_log', 'true', 'Ativar log de auditoria'),
    ('enable_email_notifications', 'false', 'Ativar notificações por email')
ON CONFLICT (key) DO NOTHING;

-- Função para configurar sistema limpo (produção)
CREATE OR REPLACE FUNCTION setup_clean_system()
RETURNS TEXT AS $$
BEGIN
    -- Limpar dados de teste se existirem
    DELETE FROM group_members;
    DELETE FROM groups;
    DELETE FROM participants;
    DELETE FROM audit_logs;
    DELETE FROM admin_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    
    RETURN 'Sistema limpo e pronto para produção';
END;
$$ LANGUAGE plpgsql;

-- Views para relatórios
CREATE OR REPLACE VIEW sorteio_report AS
SELECT 
    g.nome as grupo_nome,
    g.cor as grupo_cor,
    g.created_at as grupo_criado_em,
    p.nome as participante_nome,
    p.curso as participante_curso,
    p.semestre as participante_semestre,
    gm.position as posicao_no_grupo,
    gm.joined_at as adicionado_ao_grupo_em
FROM groups g
JOIN group_members gm ON g.id = gm.group_id
JOIN participants p ON gm.participant_id = p.id
WHERE g.ativo = TRUE AND p.ativo = TRUE
ORDER BY g.nome, gm.position;

-- Função de backup de dados críticos
CREATE OR REPLACE FUNCTION backup_critical_data()
RETURNS TABLE(
    table_name TEXT,
    record_count BIGINT,
    last_modified TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'participants'::TEXT,
        COUNT(*),
        MAX(updated_at)
    FROM participants
    UNION ALL
    SELECT 
        'groups'::TEXT,
        COUNT(*),
        MAX(updated_at)
    FROM groups
    UNION ALL
    SELECT 
        'group_members'::TEXT,
        COUNT(*),
        MAX(joined_at)
    FROM group_members;
END;
$$ LANGUAGE plpgsql;

-- Trigger para validar integridade dos dados
CREATE OR REPLACE FUNCTION validate_group_capacity()
RETURNS TRIGGER AS $$
DECLARE
    current_count INTEGER;
    max_capacity INTEGER;
BEGIN
    -- Verificar capacidade do grupo
    SELECT COUNT(*), g.max_membros
    INTO current_count, max_capacity
    FROM group_members gm
    JOIN groups g ON gm.group_id = g.id
    WHERE gm.group_id = NEW.group_id AND g.ativo = TRUE
    GROUP BY g.max_membros;
    
    IF current_count >= max_capacity THEN
        RAISE EXCEPTION 'Grupo já está na capacidade máxima (% membros)', max_capacity;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_group_capacity_trigger ON group_members;
CREATE TRIGGER validate_group_capacity_trigger
    BEFORE INSERT ON group_members
    FOR EACH ROW
    EXECUTE FUNCTION validate_group_capacity();

-- Função para relatório de participação por curso
CREATE OR REPLACE FUNCTION participation_by_course_report()
RETURNS TABLE(
    curso TEXT,
    total_cadastrados BIGINT,
    em_grupos BIGINT,
    sem_grupo BIGINT,
    percentual_em_grupos NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.curso,
        COUNT(*) as total_cadastrados,
        COUNT(gm.participant_id) as em_grupos,
        COUNT(*) - COUNT(gm.participant_id) as sem_grupo,
        ROUND(
            (COUNT(gm.participant_id)::NUMERIC / COUNT(*)::NUMERIC) * 100, 
            2
        ) as percentual_em_grupos
    FROM participants p
    LEFT JOIN group_members gm ON p.id = gm.participant_id
    LEFT JOIN groups g ON gm.group_id = g.id AND g.ativo = TRUE
    WHERE p.ativo = TRUE
    GROUP BY p.curso
    ORDER BY total_cadastrados DESC, curso;
END;
$$ LANGUAGE plpgsql;

-- Inserir dados de exemplo apenas em ambiente de desenvolvimento
DO $$
BEGIN
    -- Verificar se é ambiente de desenvolvimento
    IF current_setting('server_version_num')::int >= 120000 AND 
       (SELECT COUNT(*) FROM participants) = 0 THEN
        
        -- Inserir alguns participantes de exemplo
        INSERT INTO participants (nome, curso, semestre) VALUES
            ('João Silva', 'Medicina', 3),
            ('Maria Santos', 'Engenharia de Computação', 5),
            ('Pedro Costa', 'Administração Pública', 2),
            ('Ana Oliveira', 'Relações Internacionais', 4)
        ON CONFLICT (nome, curso) DO NOTHING;
        
        RAISE NOTICE 'Dados de exemplo inseridos';
    END IF;
END;
$$;
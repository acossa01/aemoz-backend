-- scripts/init.sql
-- Script de inicialização do banco de dados

-- Criar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Criar schema principal
CREATE SCHEMA IF NOT EXISTS aemoz;

-- Configurar search_path
SET search_path TO aemoz, public;

-- Tabela de participantes
CREATE TABLE IF NOT EXISTS participants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL CHECK (length(trim(nome)) >= 3),
    curso VARCHAR(255) NOT NULL,
    semestre INTEGER NOT NULL CHECK (semestre >= 1 AND semestre <= 10),
    email VARCHAR(320) UNIQUE,
    telefone VARCHAR(20),
    observacoes TEXT,
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_participant_per_course UNIQUE(nome, curso)
);

-- Tabela de grupos
CREATE TABLE IF NOT EXISTS groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cor VARCHAR(7) NOT NULL CHECK (cor ~ '^#[0-9A-Fa-f]{6}$'),
    descricao TEXT,
    max_membros INTEGER DEFAULT 4 CHECK (max_membros > 0),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_group_name UNIQUE(nome)
);

-- Tabela de membros dos grupos
CREATE TABLE IF NOT EXISTS group_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 1,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_participant_in_group UNIQUE(participant_id),
    CONSTRAINT valid_position CHECK (position > 0)
);

-- Tabela de sessões administrativas (para controle de acesso)
CREATE TABLE IF NOT EXISTS admin_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    user_agent TEXT,
    ip_address INET,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de auditoria (log de ações importantes)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    user_info JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de cursos (para validação)
CREATE TABLE IF NOT EXISTS courses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    nome VARCHAR(255) NOT NULL UNIQUE,
    codigo VARCHAR(20) UNIQUE,
    campus VARCHAR(100),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_participants_curso ON participants(curso);
CREATE INDEX IF NOT EXISTS idx_participants_semestre ON participants(semestre);
CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at);
CREATE INDEX IF NOT EXISTS idx_participants_ativo ON participants(ativo);
CREATE INDEX IF NOT EXISTS idx_participants_nome_gin ON participants USING gin(to_tsvector('portuguese', nome));

CREATE INDEX IF NOT EXISTS idx_groups_created_at ON groups(created_at);
CREATE INDEX IF NOT EXISTS idx_groups_ativo ON groups(ativo);

CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_participant_id ON group_members(participant_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
DROP TRIGGER IF EXISTS update_participants_updated_at ON participants;
CREATE TRIGGER update_participants_updated_at
    BEFORE UPDATE ON participants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON groups;
CREATE TRIGGER update_groups_updated_at
    BEFORE UPDATE ON groups
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Função de auditoria
CREATE OR REPLACE FUNCTION audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values)
        VALUES (TG_OP, TG_TABLE_NAME, OLD.id, to_jsonb(OLD));
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (action, table_name, record_id, old_values, new_values)
        VALUES (TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(OLD), to_jsonb(NEW));
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (action, table_name, record_id, new_values)
        VALUES (TG_OP, TG_TABLE_NAME, NEW.id, to_jsonb(NEW));
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Triggers de auditoria
DROP TRIGGER IF EXISTS participants_audit ON participants;
CREATE TRIGGER participants_audit
    AFTER INSERT OR UPDATE OR DELETE ON participants
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS groups_audit ON groups;
CREATE TRIGGER groups_audit
    AFTER INSERT OR UPDATE OR DELETE ON groups
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

DROP TRIGGER IF EXISTS group_members_audit ON group_members;
CREATE TRIGGER group_members_audit
    AFTER INSERT OR UPDATE OR DELETE ON group_members
    FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- View para estatísticas
CREATE OR REPLACE VIEW stats_view AS
SELECT 
    (SELECT COUNT(*) FROM participants WHERE ativo = TRUE) as total_participants,
    (SELECT COUNT(DISTINCT curso) FROM participants WHERE ativo = TRUE) as total_courses,
    (SELECT COUNT(*) FROM groups WHERE ativo = TRUE) as total_groups,
    (SELECT COUNT(*) FROM group_members 
     JOIN groups g ON group_members.group_id = g.id 
     WHERE g.ativo = TRUE) as total_group_members;

-- View para participantes por curso
CREATE OR REPLACE VIEW participants_by_course AS
SELECT 
    curso,
    COUNT(*) as total_participants,
    COUNT(*) FILTER (WHERE semestre <= 2) as iniciantes,
    COUNT(*) FILTER (WHERE semestre >= 7) as veteranos,
    json_agg(
        json_build_object(
            'id', id,
            'nome', nome,
            'semestre', semestre,
            'created_at', created_at
        ) ORDER BY nome
    ) as participants_details
FROM participants 
WHERE ativo = TRUE
GROUP BY curso
ORDER BY total_participants DESC, curso;

-- Função para limpar sessões expiradas
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM admin_sessions WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Função para estatísticas do sorteio
CREATE OR REPLACE FUNCTION sorteio_stats()
RETURNS TABLE(
    total_participants BIGINT,
    participants_in_groups BIGINT,
    participants_without_group BIGINT,
    total_groups BIGINT,
    average_group_size NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM participants WHERE ativo = TRUE) as total_participants,
        (SELECT COUNT(*) FROM group_members 
         JOIN groups g ON group_members.group_id = g.id 
         WHERE g.ativo = TRUE) as participants_in_groups,
        (SELECT COUNT(*) FROM participants p 
         WHERE p.ativo = TRUE 
         AND p.id NOT IN (
             SELECT gm.participant_id FROM group_members gm
             JOIN groups g ON gm.group_id = g.id
             WHERE g.ativo = TRUE
         )) as participants_without_group,
        (SELECT COUNT(*) FROM groups WHERE ativo = TRUE) as total_groups,
        (SELECT COALESCE(AVG(member_count), 0) FROM (
            SELECT COUNT(*) as member_count
            FROM group_members gm
            JOIN groups g ON gm.group_id = g.id
            WHERE g.ativo = TRUE
            GROUP BY g.id
        ) as group_sizes) as average_group_size;
END;
$$ LANGUAGE plpgsql;

-- Comentários nas tabelas
COMMENT ON TABLE participants IS 'Participantes cadastrados no sistema';
COMMENT ON TABLE groups IS 'Grupos formados no sorteio';
COMMENT ON TABLE group_members IS 'Relação entre participantes e grupos';
COMMENT ON TABLE admin_sessions IS 'Sessões administrativas ativas';
COMMENT ON TABLE audit_logs IS 'Log de auditoria das operações';
COMMENT ON TABLE courses IS 'Lista de cursos disponíveis';

-- Comentários nas colunas importantes
COMMENT ON COLUMN participants.nome IS 'Nome completo do participante';
COMMENT ON COLUMN participants.curso IS 'Curso do participante na UNILAB';
COMMENT ON COLUMN participants.semestre IS 'Semestre atual (1-10)';
COMMENT ON COLUMN groups.cor IS 'Cor do grupo em formato hexadecimal (#RRGGBB)';

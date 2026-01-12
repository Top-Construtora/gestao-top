const { createClient } = require('@supabase/supabase-js');

// Cliente Supabase para todas as operações
let supabase = null;

// Configurar Supabase apenas se as variáveis existirem
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  try {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        },
        db: {
          schema: 'public'
        }
      }
    );
    console.log('✅ Cliente Supabase configurado');
  } catch (error) {
    console.error('❌ Erro ao configurar Supabase:', error);
    process.exit(1);
  }
} else {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórios');
  console.error('💡 Configure as variáveis de ambiente no Render');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Pool compatível que usa Supabase internamente
const pool = {
  query: async (text, params) => {
    // Para o SELECT NOW() do servidor - tratamento especial
    if (text === 'SELECT NOW()') {
      return { 
        rows: [{ 
          now: new Date(),
          db: process.env.SUPABASE_URL ? 'supabase' : 'mock'
        }] 
      };
    }
    
    // Para outras queries, usar a função query
    return query(text, params);
  },
  connect: async () => {
    return {
      query: async (text, params) => query(text, params),
      release: () => {}
    };
  },
  end: async () => {
    console.log('📊 Fechando conexões do banco...');
  }
};

// Função auxiliar para executar queries usando Supabase
async function query(text, params = []) {
  if (!supabase) {
    throw new Error('Supabase não está configurado');
  }

  console.log('📊 Query:', text.substring(0, 50) + '...');
  
  try {
    // SELECT queries
    if (text.toLowerCase().includes('select')) {
      return await handleSelect(text, params);
    }
    
    // INSERT queries
    if (text.toLowerCase().includes('insert')) {
      return await handleInsert(text, params);
    }
    
    // UPDATE queries
    if (text.toLowerCase().includes('update')) {
      return await handleUpdate(text, params);
    }
    
    // DELETE queries
    if (text.toLowerCase().includes('delete')) {
      return await handleDelete(text, params);
    }
    
    console.warn(`⚠️ Query não implementada: ${text.substring(0, 50)}...`);
    // Retornar resultado vazio para queries não implementadas
    return { rows: [], rowCount: 0 };
  } catch (error) {
    console.error('❌ Erro na query:', error.message);
    throw error;
  }
}

async function handleSelect(text, params) {
  // SELECT de usuários
  if (text.includes('FROM users')) {
    let query = supabase
      .from('users')
      .select('*, roles(name)');
    
    // WHERE email = $1
    if (text.includes('WHERE u.email') || text.includes('WHERE email')) {
      const { data, error } = await query.eq('email', params[0]).single();
      if (error && error.code === 'PGRST116') return { rows: [] }; // Não encontrado
      if (error) throw error;
      
      // Ajustar formato para compatibilidade
      if (data) {
        data.role_name = data.roles?.name;
        delete data.roles;
      }
      
      return { rows: data ? [data] : [] };
    }
    
    // WHERE id = $1
    if (text.includes('WHERE u.id') || text.includes('WHERE id')) {
      const { data, error } = await query.eq('id', params[0]).single();
      if (error && error.code === 'PGRST116') return { rows: [] };
      if (error) throw error;
      
      if (data) {
        data.role_name = data.roles?.name;
        delete data.roles;
      }
      
      return { rows: data ? [data] : [] };
    }
    
    // WHERE reset_token = $1
    if (text.includes('WHERE reset_token')) {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('reset_token', params[0])
        .gt('reset_token_expires', new Date().toISOString())
        .single();
      
      if (error && error.code === 'PGRST116') return { rows: [] };
      if (error) throw error;
      
      return { rows: data ? [data] : [] };
    }
    
    // SELECT all users
    const { data, error } = await query;
    if (error) throw error;
    
    // Ajustar formato
    const users = (data || []).map(user => ({
      ...user,
      role_name: user.roles?.name,
      roles: undefined
    }));
    
    return { rows: users };
  }
  
  // SELECT de roles
  if (text.includes('FROM roles')) {
    const { data, error } = await supabase
      .from('roles')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return { rows: data || [] };
  }
  
  // SELECT de permissões
  if (text.includes('FROM permissions')) {
    const { data, error } = await supabase
      .from('permissions')
      .select('*, role_permissions!inner(role_id)')
      .eq('role_permissions.role_id', params[0]);
    
    if (error) throw error;
    return { rows: data || [] };
  }
  
  // SELECT de empresas
  if (text.includes('FROM companies')) {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return { rows: data || [] };
  }
  
  // SELECT de serviços
  if (text.includes('FROM services')) {
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .order('name');
    
    if (error) throw error;
    return { rows: data || [] };
  }
  
  // SELECT de contratos
  if (text.includes('FROM contracts')) {
    const { data, error } = await supabase
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return { rows: data || [] };
  }

  // SELECT de anexos de comentários
  if (text.includes('FROM service_comment_attachments')) {
    if (text.includes('LEFT JOIN users')) {
      // Query com JOIN para buscar nome do uploader
      const commentId = params[0];
      const { data, error } = await supabase
        .from('service_comment_attachments')
        .select(`
          *,
          users!service_comment_attachments_uploaded_by_fkey(name)
        `)
        .eq('comment_id', commentId)
        .eq('is_active', true)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      
      // Transformar para formato esperado
      const attachments = (data || []).map(row => ({
        ...row,
        uploader_name: row.users?.name || 'Usuário desconhecido'
      }));
      
      return { rows: attachments };
    }

    // SELECT simples de anexo por ID
    if (text.includes('WHERE id')) {
      const attachmentId = params[0];
      const { data, error } = await supabase
        .from('service_comment_attachments')
        .select('*')
        .eq('id', attachmentId)
        .eq('is_active', true)
        .single();

      if (error && error.code === 'PGRST116') return { rows: [] };
      if (error) throw error;
      
      return { rows: data ? [data] : [] };
    }

    // COUNT de anexos
    if (text.includes('COUNT(*)')) {
      const commentId = params[0];
      const { count, error } = await supabase
        .from('service_comment_attachments')
        .select('*', { count: 'exact', head: true })
        .eq('comment_id', commentId)
        .eq('is_active', true);

      if (error) throw error;
      return { rows: [{ count: count || 0 }] };
    }
  }

  // SELECT complexos para verificação de permissões
  if (text.includes('contract_service_comments') && text.includes('JOIN')) {
    // Consulta de permissão para comentários
    if (text.includes('contract_assignments')) {
      const [userId, commentId] = params;
      
      // Query complexa usando RPC ou view personalizada se necessário
      // Para simplificar, vamos fazer queries separadas
      const { data: comment, error: commentError } = await supabase
        .from('contract_service_comments')
        .select('*, contract_services!inner(*)')
        .eq('id', commentId)
        .single();

      if (commentError) return { rows: [] };

      // Verificar se é o dono do comentário
      if (comment.user_id === userId) {
        return { rows: [{ id: comment.id }] };
      }

      // Verificar se tem acesso ao contrato
      const { data: assignment } = await supabase
        .from('contract_assignments')
        .select('*')
        .eq('contract_id', comment.contract_services.contract_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      if (assignment) {
        return { rows: [{ id: comment.id }] };
      }

      // Verificar se é admin
      const { data: user } = await supabase
        .from('users')
        .select('*, roles!inner(*)')
        .eq('id', userId)
        .eq('roles.name', 'admin')
        .single();

      if (user) {
        return { rows: [{ id: comment.id }] };
      }

      return { rows: [] };
    }
  }
  
  console.warn(`⚠️ SELECT não implementado: ${text}`);
  return { rows: [] };
}

async function handleInsert(text, params) {
  // INSERT INTO users
  if (text.includes('INSERT INTO users')) {
    const [email, password, name, roleId] = params;
    
    const { data, error } = await supabase
      .from('users')
      .insert([{
        email,
        password,
        name,
        role_id: roleId
      }])
      .select('id, email, name, role_id, is_active, created_at')
      .single();
    
    if (error) throw error;
    return { rows: [data] };
  }

  // INSERT INTO service_comment_attachments
  if (text.includes('INSERT INTO service_comment_attachments')) {
    const [commentId, fileName, originalName, filePath, fileSize, mimeType, uploadedBy, publicUrl] = params;
    
    const { data, error } = await supabase
      .from('service_comment_attachments')
      .insert([{
        comment_id: commentId,
        file_name: fileName,
        original_name: originalName,
        file_path: filePath,
        file_size: fileSize,
        mime_type: mimeType,
        uploaded_by: uploadedBy,
        public_url: publicUrl
      }])
      .select('*')
      .single();
    
    if (error) throw error;
    return { rows: [data] };
  }
  
  // INSERT genérico para outras tabelas
  console.warn(`⚠️ INSERT não implementado: ${text}`);
  return { rows: [], rowCount: 0 };
}

async function handleUpdate(text, params) {
  // UPDATE users SET password
  if (text.includes('UPDATE users') && text.includes('password')) {
    const [hashedPassword, id] = params;
    
    const { error } = await supabase
      .from('users')
      .update({
        password: hashedPassword,
        reset_token: null,
        reset_token_expires: null
      })
      .eq('id', id);
    
    if (error) throw error;
    return { rowCount: 1 };
  }
  
  // UPDATE users SET reset_token
  if (text.includes('UPDATE users') && text.includes('reset_token')) {
    const [token, expires, email] = params;
    
    const { data, error } = await supabase
      .from('users')
      .update({
        reset_token: token,
        reset_token_expires: expires
      })
      .eq('email', email)
      .select('id')
      .single();
    
    if (error) throw error;
    return { rows: [data] };
  }
  
  // UPDATE users genérico
  if (text.includes('UPDATE users')) {
    // Extrair campos do SET
    const updates = {};
    const setMatch = text.match(/SET (.+) WHERE/i);
    if (setMatch) {
      const setPart = setMatch[1];
      const fields = setPart.split(',').map(f => f.trim());
      
      fields.forEach((field, index) => {
        const [key] = field.split('=').map(f => f.trim());
        if (key !== 'updated_at') {
          updates[key] = params[index];
        }
      });
    }
    
    const id = params[params.length - 1];
    
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return { rows: [data] };
  }

  // UPDATE service_comment_attachments (soft delete)
  if (text.includes('UPDATE service_comment_attachments')) {
    if (text.includes('is_active = false')) {
      const attachmentId = params[0];
      
      const { error } = await supabase
        .from('service_comment_attachments')
        .update({ is_active: false })
        .eq('id', attachmentId);
      
      if (error) throw error;
      return { rowCount: 1 };
    }
  }

  // UPDATE contract_service_comments (has_attachments flag)
  if (text.includes('UPDATE contract_service_comments') && text.includes('has_attachments')) {
    const [hasAttachments, commentId] = params;
    
    const { error } = await supabase
      .from('contract_service_comments')
      .update({ has_attachments: hasAttachments })
      .eq('id', commentId);
    
    if (error) throw error;
    return { rowCount: 1 };
  }
  
  console.warn(`⚠️ UPDATE não implementado: ${text}`);
  return { rowCount: 0 };
}

async function handleDelete(text, params) {
  // DELETE genérico
  console.warn(`⚠️ DELETE não implementado: ${text}`);
  return { rowCount: 0 };
}

// Função de teste de conexão
const testConnection = async () => {
  try {
    if (!supabase) {
      return false;
    }
    
    // Testar uma query simples com timeout
    const { data, error } = await Promise.race([
      supabase
        .from('roles')
        .select('name')
        .limit(1),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 5000)
      )
    ]);
    
    if (error) {
      return false;
    }
    
    return true;
  } catch (error) {
    // Silenciar erros de conectividade para não poluir logs
    return false;
  }
};

module.exports = {
  supabase,
  pool,
  query,
  testConnection
};
const express = require('express');
const router = express.Router();
const Routine = require('../models/Routine');
const authMiddleware = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { supabase } = require('../config/database');

// Aplicar middleware de autenticação em todas as rotas
router.use(authMiddleware);

// Configuração do multer para upload em memória (não no disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    fieldSize: 1024 * 1024 // 1MB
  },
  fileFilter: function (req, file, cb) {
    // Permitir tipos de arquivo específicos
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'), false);
    }
  }
});

/**
 * POST /api/routines
 * Criar nova rotina para um serviço do contrato
 */
router.post('/', async (req, res) => {
  try {
    const { contract_service_id, status, scheduled_date, notes } = req.body;

    if (!contract_service_id) {
      return res.status(400).json({ 
        success: false,
        message: 'ID do serviço do contrato é obrigatório' 
      });
    }

    if (!status) {
      return res.status(400).json({ 
        success: false,
        message: 'Status é obrigatório' 
      });
    }

    const routine = await Routine.create({
      contract_service_id,
      status,
      scheduled_date: scheduled_date || null,
      notes: notes || null
    });

    res.status(201).json({
      success: true,
      data: routine,
      message: 'Rotina criada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar rotina:', error);

    // Se o serviço não foi encontrado, retornar 404
    if (error.code === 'SERVICE_NOT_FOUND' || error.statusCode === 404) {
      return res.status(404).json({
        success: false,
        message: 'Serviço do contrato não encontrado',
        error: 'O serviço associado a esta rotina não existe ou foi removido'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erro ao criar rotina',
      error: error.message
    });
  }
});

/**
 * GET /api/routines/contract-service/:contractServiceId
 * Buscar rotina por ID do serviço do contrato
 */
router.get('/contract-service/:contractServiceId', async (req, res) => {
  try {
    const { contractServiceId } = req.params;
    const routine = await Routine.findByContractServiceId(contractServiceId);
    
    res.json(routine || null);
  } catch (error) {
    console.error('Erro ao buscar rotina:', error);
    res.status(500).json({ 
      message: 'Erro ao buscar rotina',
      error: error.message 
    });
  }
});

/**
 * PUT /api/routines/contract-service/:contractServiceId
 * Atualizar status e data da rotina
 */
router.put('/contract-service/:contractServiceId', async (req, res) => {
  try {
    const { contractServiceId } = req.params;
    const { status, scheduled_date, notes } = req.body;

    if (!status) {
      return res.status(400).json({ 
        message: 'Status é obrigatório' 
      });
    }

    const routine = await Routine.updateStatus(
      contractServiceId,
      status,
      scheduled_date,
      notes
    );

    res.json(routine);
  } catch (error) {
    console.error('Erro ao atualizar rotina:', error);

    // Se o serviço não foi encontrado, retornar 404
    if (error.code === 'SERVICE_NOT_FOUND' || error.statusCode === 404) {
      return res.status(404).json({
        message: 'Serviço do contrato não encontrado',
        error: 'O serviço associado a esta rotina não existe ou foi removido'
      });
    }

    res.status(500).json({
      message: 'Erro ao atualizar rotina',
      error: error.message
    });
  }
});

/**
 * GET /api/routines/:routineId/comments
 * Buscar comentários da rotina (com validação de permissão)
 */
router.get('/:routineId/comments', async (req, res) => {
  try {
    const { routineId } = req.params;
    const userId = req.user.id;

    // VALIDAÇÃO: Verificar se a rotina existe
    const { data: routine, error: routineError } = await supabase
      .from('service_routines')
      .select('id, contract_service_id')
      .eq('id', routineId)
      .single();

    if (routineError || !routine) {
      console.error('🚨 Tentativa de buscar comentários de rotina inexistente:', {
        routineId,
        userId,
        timestamp: new Date().toISOString()
      });
      return res.status(404).json({
        message: 'Rotina não encontrada',
        error: 'A rotina especificada não existe'
      });
    }

    // VALIDAÇÃO: Verificar permissão do usuário
    const { data: contractService, error: serviceError } = await supabase
      .from('contract_services')
      .select(`
        id,
        contract_id,
        contract:contracts!inner(
          id,
          client_id,
          created_by
        )
      `)
      .eq('id', routine.contract_service_id)
      .single();

    if (serviceError || !contractService) {
      console.error('Serviço do contrato não encontrado:', routine.contract_service_id);
      return res.status(404).json({
        message: 'Serviço do contrato não encontrado'
      });
    }

    // Verificar se o usuário tem acesso
    const { data: assignments } = await supabase
      .from('contract_assignments')
      .select('user_id')
      .eq('contract_id', contractService.contract_id)
      .eq('is_active', true);

    const isCreator = contractService.contract?.created_by === userId;
    const isAssigned = assignments?.some(a => a.user_id === userId);

    if (!isCreator && !isAssigned) {
      console.error('🚨 Usuário sem permissão tentando acessar comentários:', {
        userId,
        routineId,
        contractId: contractService.contract_id,
        timestamp: new Date().toISOString()
      });
      return res.status(403).json({
        message: 'Permissão negada',
        error: 'Você não tem permissão para visualizar comentários desta rotina'
      });
    }

    // Buscar comentários após validação
    const comments = await Routine.getComments(routineId);

    console.log('✅ Comentários buscados com sucesso:', {
      routineId,
      userId,
      commentCount: comments.length,
      contractId: contractService.contract_id,
      timestamp: new Date().toISOString()
    });

    res.json(comments);
  } catch (error) {
    console.error('❌ Erro ao buscar comentários:', error);
    res.status(500).json({
      message: 'Erro ao buscar comentários',
      error: error.message
    });
  }
});

/**
 * POST /api/routines/:routineId/comments
 * Adicionar comentário à rotina
 */
router.post('/:routineId/comments', async (req, res) => {
  try {
    const { routineId } = req.params;
    const { comment, service_stage_id } = req.body;
    const userId = req.user.id;

    // LOG DE AUDITORIA: Registrar tentativa de comentário
    console.log('📝 AUDITORIA: Tentativa de adicionar comentário', {
      routineId,
      userId,
      userName: req.user.name,
      commentLength: comment?.length || 0,
      serviceStageId: service_stage_id || null,
      timestamp: new Date().toISOString(),
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    });

    if (!comment || !comment.trim()) {
      console.warn('⚠️ Comentário vazio rejeitado:', { userId, routineId });
      return res.status(400).json({
        message: 'Comentário não pode estar vazio'
      });
    }

    // VALIDAÇÃO 1: Verificar se a rotina existe
    const { data: routine, error: routineError } = await supabase
      .from('service_routines')
      .select('id, contract_service_id')
      .eq('id', routineId)
      .single();

    if (routineError || !routine) {
      console.error('🚨 ALERTA DE SEGURANÇA: Tentativa de comentar em rotina inexistente', {
        routineId,
        userId,
        userName: req.user.name,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        error: routineError?.message || 'Rotina não encontrada'
      });
      return res.status(404).json({
        message: 'Rotina não encontrada',
        error: 'A rotina especificada não existe'
      });
    }

    // VALIDAÇÃO 2: Verificar se o usuário tem permissão para comentar
    // Busca o contrato relacionado à rotina através do contract_service
    const { data: contractService, error: serviceError } = await supabase
      .from('contract_services')
      .select(`
        id,
        contract_id,
        contract:contracts!inner(
          id,
          client_id,
          created_by
        )
      `)
      .eq('id', routine.contract_service_id)
      .single();

    if (serviceError || !contractService) {
      console.error('Serviço do contrato não encontrado:', routine.contract_service_id);
      return res.status(404).json({
        message: 'Serviço do contrato não encontrado',
        error: 'O serviço associado a esta rotina não existe'
      });
    }

    // VALIDAÇÃO 3: Verificar se o usuário tem acesso ao contrato
    // Qualquer usuário vinculado ao contrato pode comentar
    const { data: assignments, error: assignmentError } = await supabase
      .from('contract_assignments')
      .select('user_id')
      .eq('contract_id', contractService.contract_id)
      .eq('is_active', true);

    if (assignmentError) {
      console.error('Erro ao verificar atribuições:', assignmentError);
      return res.status(500).json({
        message: 'Erro ao verificar permissões',
        error: assignmentError.message
      });
    }

    // Verificar se o usuário está na lista de atribuições ou é o criador
    const isCreator = contractService.contract?.created_by === userId;
    const isAssigned = assignments?.some(a => a.user_id === userId);

    if (!isCreator && !isAssigned) {
      console.error('🚨 ALERTA DE SEGURANÇA: Usuário sem permissão tentando comentar', {
        userId,
        userName: req.user.name,
        contractId: contractService.contract_id,
        routineId,
        clientId: contractService.contract?.client_id,
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress
      });
      return res.status(403).json({
        message: 'Permissão negada',
        error: 'Você não tem permissão para comentar nesta rotina'
      });
    }

    console.log('✅ VALIDAÇÕES APROVADAS - Salvando comentário:', {
      routineId,
      userId,
      userName: req.user.name,
      contractId: contractService.contract_id,
      clientId: contractService.contract?.client_id,
      contractServiceId: routine.contract_service_id,
      timestamp: new Date().toISOString()
    });

    // Salvar comentário após todas as validações
    const newComment = await Routine.addComment(
      routineId,
      userId,
      comment.trim(),
      false, // hasAttachments
      service_stage_id || null
    );

    // LOG DE SUCESSO: Comentário salvo corretamente
    console.log('🎉 SUCESSO: Comentário salvo corretamente', {
      commentId: newComment.id,
      routineId: newComment.routine_id,
      userId: newComment.user_id,
      userName: req.user.name,
      contractId: contractService.contract_id,
      clientId: contractService.contract?.client_id,
      commentPreview: comment.substring(0, 50) + (comment.length > 50 ? '...' : ''),
      timestamp: new Date().toISOString()
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error('Erro ao adicionar comentário:', error);
    res.status(500).json({
      message: 'Erro ao adicionar comentário',
      error: error.message
    });
  }
});

/**
 * POST /api/routines/comments/:commentId/upload
 * Upload de anexo para comentário de rotina usando apenas Supabase Storage
 */
router.post('/comments/:commentId/upload', upload.single('file'), async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    console.log('Upload iniciado para comentário:', commentId);
    console.log('Arquivo recebido:', req.file?.originalname);

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo foi enviado'
      });
    }

    // Verificar se o comentário existe
    const { data: comment, error: commentError } = await supabase
      .from('routine_comments')
      .select('id, routine_id')
      .eq('id', commentId)
      .single();

    if (commentError || !comment) {
      console.error('Comentário não encontrado:', commentError);
      return res.status(404).json({
        success: false,
        error: 'Comentário não encontrado'
      });
    }

    console.log('Comentário encontrado, fazendo upload para Supabase Storage...');

    // Usar o buffer do arquivo da memória
    const fileBuffer = req.file.buffer;
    const fileName = `routine_${comment.routine_id}/comment_${commentId}/${Date.now()}_${req.file.originalname}`;
    
    console.log('Enviando para bucket routine-attachments, arquivo:', fileName);

    // Tentar diferentes nomes de bucket que podem existir
    const possibleBuckets = ['routine-comment-attachments', 'attachments', 'files', 'routine-attachments'];
    let uploadSuccess = false;
    let finalPublicUrl = '';
    let usedBucket = '';

    for (const bucketName of possibleBuckets) {
      console.log(`Tentando upload no bucket: ${bucketName}`);
      
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from(bucketName)
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: false
        });

      if (!uploadError) {
        console.log(`Upload bem-sucedido no bucket: ${bucketName}`);
        uploadSuccess = true;
        usedBucket = bucketName;
        
        // Obter URL pública do arquivo
        const { data: { publicUrl } } = supabase
          .storage
          .from(bucketName)
          .getPublicUrl(fileName);
        
        finalPublicUrl = publicUrl;
        break;
      } else {
        console.log(`Erro no bucket ${bucketName}:`, uploadError.message);
      }
    }

    if (!uploadSuccess) {
      console.error('Nenhum bucket disponível encontrado. Tentando criar bucket padrão...');
      
      // Criar bucket se nenhum existir
      const defaultBucket = 'routine-comment-attachments';
      const { error: bucketError } = await supabase.storage.createBucket(defaultBucket, {
        public: true
      });
      
      if (bucketError && !bucketError.message.includes('already exists')) {
        console.error('Erro ao criar bucket:', bucketError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao configurar armazenamento: ' + bucketError.message
        });
      }
      
      // Tentar upload no bucket recém-criado ou existente
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from(defaultBucket)
        .upload(fileName, fileBuffer, {
          contentType: req.file.mimetype,
          upsert: false
        });
        
      if (uploadError) {
        console.error('Erro no upload após criar bucket:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload do arquivo: ' + uploadError.message
        });
      }
      
      uploadSuccess = true;
      usedBucket = defaultBucket;
      
      // Obter URL pública do arquivo
      const { data: { publicUrl } } = supabase
        .storage
        .from(defaultBucket)
        .getPublicUrl(fileName);
      
      finalPublicUrl = publicUrl;
      console.log(`Upload bem-sucedido no bucket criado: ${defaultBucket}`);
    }

    console.log('URL pública gerada:', finalPublicUrl);
    console.log('Bucket utilizado:', usedBucket);

    // Criar registro do anexo no banco
    const attachmentData = {
      comment_id: parseInt(commentId),
      file_name: fileName,
      original_name: req.file.originalname,
      file_path: finalPublicUrl,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      uploaded_by: userId
    };

    console.log('Salvando dados do anexo no banco:', attachmentData);

    const { data: attachment, error: insertError } = await supabase
      .from('routine_comment_attachments')
      .insert(attachmentData)
      .select()
      .single();

    if (insertError) {
      console.error('Erro ao salvar anexo no banco:', insertError);
      // Tentar deletar arquivo do Storage se falhar ao salvar no banco
      if (usedBucket) {
        await supabase.storage
          .from(usedBucket)
          .remove([fileName]);
      }
      return res.status(500).json({
        success: false,
        error: 'Erro ao salvar dados do anexo'
      });
    }

    console.log('Anexo salvo no banco:', attachment);

    // Atualizar flag has_attachments no comentário
    const { error: updateError } = await supabase
      .from('routine_comments')
      .update({ has_attachments: true })
      .eq('id', commentId);

    if (updateError) {
      console.error('Erro ao atualizar has_attachments:', updateError);
    } else {
      console.log('Flag has_attachments atualizada com sucesso');
    }

    console.log('Resposta final:', attachment);

    res.json({
      success: true,
      message: 'Arquivo enviado com sucesso',
      attachment: attachment
    });

  } catch (error) {
    console.error('Erro no upload:', error);
    
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

/**
 * POST /api/routines/comments/:commentId/attachments
 * Adicionar anexo ao comentário (método antigo, manter para compatibilidade)
 */
router.post('/comments/:commentId/attachments', async (req, res) => {
  try {
    const { commentId } = req.params;
    const attachmentData = {
      comment_id: commentId,
      ...req.body,
      uploaded_by: req.user.id
    };

    const attachment = await Routine.addAttachment(commentId, attachmentData);
    
    res.status(201).json(attachment);
  } catch (error) {
    console.error('Erro ao adicionar anexo:', error);
    res.status(500).json({ 
      message: 'Erro ao adicionar anexo',
      error: error.message 
    });
  }
});

/**
 * DELETE /api/routines/comments/:commentId
 * Deletar comentário da rotina
 */
router.delete('/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user.id;

    const result = await Routine.deleteComment(commentId, userId);
    
    res.json(result);
  } catch (error) {
    console.error('Erro ao deletar comentário:', error);
    
    if (error.message === 'Comentário não encontrado') {
      return res.status(404).json({ 
        message: 'Comentário não encontrado',
        error: error.message 
      });
    }
    
    if (error.message === 'Unauthorized: You can only delete your own comments') {
      return res.status(403).json({ 
        message: 'Você só pode deletar seus próprios comentários',
        error: error.message 
      });
    }
    
    res.status(500).json({ 
      message: 'Erro ao deletar comentário',
      error: error.message 
    });
  }
});

/**
 * GET /api/routines/:routineId
 * Buscar rotina por ID
 */
router.get('/:routineId', async (req, res) => {
  try {
    const { routineId } = req.params;
    const routine = await Routine.findById(routineId);
    
    res.json(routine || null);
  } catch (error) {
    console.error('Erro ao buscar rotina:', error);
    res.status(500).json({ 
      message: 'Erro ao buscar rotina',
      error: error.message 
    });
  }
});

/**
 * GET /api/routines/contract/:contractId
 * Buscar todas as rotinas de um contrato
 */
router.get('/contract/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const routines = await Routine.findByContractId(contractId);
    
    res.json(routines);
  } catch (error) {
    console.error('Erro ao buscar rotinas do contrato:', error);
    res.status(500).json({ 
      message: 'Erro ao buscar rotinas do contrato',
      error: error.message 
    });
  }
});

/**
 * GET /api/routines/attachments/:attachmentId/download
 * Download de anexo de comentário de rotina do Supabase Storage
 */
router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    const { attachmentId } = req.params;
    const userId = req.user.id;

    console.log('Download solicitado para anexo:', attachmentId);

    // Buscar informações do anexo
    const { data: attachment, error: attachmentError } = await supabase
      .from('routine_comment_attachments')
      .select('*')
      .eq('id', attachmentId)
      .single();

    if (attachmentError || !attachment) {
      console.error('Anexo não encontrado:', attachmentError);
      return res.status(404).json({
        success: false,
        error: 'Anexo não encontrado'
      });
    }

    console.log('Anexo encontrado:', attachment.original_name);

    // Se o arquivo já tem uma URL pública válida do Supabase, redirecionar
    if (attachment.file_path && attachment.file_path.includes('supabase')) {
      console.log('Redirecionando para URL pública:', attachment.file_path);
      return res.redirect(attachment.file_path);
    }

    // Tentar baixar do Supabase Storage
    const possibleBuckets = ['routine-comment-attachments', 'attachments', 'files', 'routine-attachments'];
    let fileBuffer = null;
    let usedBucket = '';

    for (const bucketName of possibleBuckets) {
      console.log(`Tentando download do bucket: ${bucketName}`);
      
      const { data, error } = await supabase
        .storage
        .from(bucketName)
        .download(attachment.file_name);

      if (!error && data) {
        console.log(`Download bem-sucedido do bucket: ${bucketName}`);
        fileBuffer = await data.arrayBuffer();
        usedBucket = bucketName;
        break;
      } else {
        console.log(`Erro no bucket ${bucketName}:`, error?.message);
      }
    }

    if (!fileBuffer) {
      console.error('Arquivo não encontrado em nenhum bucket');
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado no armazenamento'
      });
    }

    console.log('Enviando arquivo para download:', attachment.original_name);

    // Configurar headers para download
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.original_name}"`);
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Length', attachment.file_size);
    
    // Enviar buffer do arquivo
    res.send(Buffer.from(fileBuffer));

  } catch (error) {
    console.error('Erro no download de anexo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

module.exports = router;
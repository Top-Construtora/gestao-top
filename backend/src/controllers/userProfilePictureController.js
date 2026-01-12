const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');

// Configuração do multer para upload em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB para profile pictures
  },
  fileFilter: function (req, file, cb) {
    // Apenas imagens
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use apenas imagens (JPEG, PNG, GIF, WebP, SVG)'), false);
    }
  }
});

class UserProfilePictureController {
  
  // Middleware do multer
  static uploadMiddleware = upload.single('profilePicture');

  // Upload de foto de perfil do usuário
  static async uploadProfilePicture(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user.id;
      
      // Verificar se o usuário está tentando atualizar sua própria foto ou se é admin
      if (currentUserId !== parseInt(userId) && req.user.role_name !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Você não tem permissão para alterar a foto de perfil deste usuário'
        });
      }
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo foi enviado'
        });
      }

      // Verificar se o usuário existe
      const { data: userExists, error: userError } = await supabase
        .from('users')
        .select('id, profile_picture_path')
        .eq('id', userId)
        .single();

      if (userError || !userExists) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      // Se já existe uma foto de perfil, deletar a antiga do Storage
      if (userExists.profile_picture_path) {
        const { error: deleteError } = await supabase.storage
          .from('user-profile-pictures')
          .remove([userExists.profile_picture_path]);
        
        if (deleteError) {
          console.warn('Erro ao deletar foto de perfil antiga:', deleteError);
        }
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `${userId}/${fileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('user-profile-pictures')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error('Erro no upload para Supabase:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload da foto de perfil'
        });
      }

      // Atualizar informações da foto de perfil no banco
      const { error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture_path: filePath,
          profile_picture_uploaded_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        // Tentar deletar o arquivo do Storage em caso de erro
        await supabase.storage.from('user-profile-pictures').remove([filePath]);
        
        console.error('Erro ao salvar informações da foto de perfil:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao salvar informações da foto de perfil'
        });
      }

      res.json({
        success: true,
        message: 'Foto de perfil atualizada com sucesso',
        profilePicture: {
          path: filePath
        }
      });

    } catch (error) {
      console.error('Erro no upload de foto de perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Obter foto de perfil do usuário
  static async getProfilePicture(req, res) {
    try {
      const { userId } = req.params;

      // Buscar informações da foto de perfil do usuário
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('profile_picture_path')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      if (!user.profile_picture_path) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não possui foto de perfil'
        });
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('user-profile-pictures')
        .download(user.profile_picture_path);

      if (error) {
        console.error('Erro ao buscar foto de perfil:', error);
        return res.status(404).json({
          success: false,
          error: 'Foto de perfil não encontrada no storage'
        });
      }

      // Configurar headers para exibição
      res.setHeader('Content-Type', 'image/jpeg'); // Assume JPEG por padrão
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano

      // Converter ArrayBuffer para Buffer e enviar
      const buffer = Buffer.from(await data.arrayBuffer());
      res.send(buffer);

    } catch (error) {
      console.error('Erro ao buscar foto de perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Obter foto de perfil público para membros da equipe (sem autenticação)
  static async getPublicTeamProfilePicture(req, res) {
    try {
      const { userId } = req.params;

      // Verificar se o usuário está marcado para aparecer na equipe
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('profile_picture_path, show_in_team, is_active')
        .eq('id', userId)
        .eq('show_in_team', true)
        .eq('is_active', true)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'Membro da equipe não encontrado ou não público'
        });
      }

      if (!user.profile_picture_path) {
        return res.status(404).json({
          success: false,
          error: 'Membro da equipe não possui foto de perfil'
        });
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('user-profile-pictures')
        .download(user.profile_picture_path);

      if (error) {
        console.error('Erro ao buscar foto de perfil pública:', error);
        return res.status(404).json({
          success: false,
          error: 'Foto de perfil não encontrada no storage'
        });
      }

      // Configurar headers para exibição
      res.setHeader('Content-Type', 'image/jpeg'); // Assume JPEG por padrão
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano

      // Converter ArrayBuffer para Buffer e enviar
      const buffer = Buffer.from(await data.arrayBuffer());
      res.send(buffer);

    } catch (error) {
      console.error('Erro ao buscar foto de perfil pública:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Deletar foto de perfil do usuário
  static async deleteProfilePicture(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user.id;

      // Verificar se o usuário está tentando deletar sua própria foto ou se é admin
      if (currentUserId !== parseInt(userId) && req.user.role_name !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'Você não tem permissão para remover a foto de perfil deste usuário'
        });
      }

      // Buscar informações da foto de perfil
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('profile_picture_path')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      if (!user.profile_picture_path) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não possui foto de perfil'
        });
      }

      // Deletar do Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('user-profile-pictures')
        .remove([user.profile_picture_path]);

      if (deleteError) {
        console.error('Erro ao deletar do storage:', deleteError);
      }

      // Limpar informações da foto de perfil no banco
      const { error: updateError } = await supabase
        .from('users')
        .update({
          profile_picture_path: null,
          profile_picture_uploaded_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        console.error('Erro ao limpar informações da foto de perfil:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao remover foto de perfil'
        });
      }

      res.json({
        success: true,
        message: 'Foto de perfil removida com sucesso'
      });

    } catch (error) {
      console.error('Erro ao deletar foto de perfil:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = UserProfilePictureController;
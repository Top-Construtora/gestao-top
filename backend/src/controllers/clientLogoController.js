const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../config/database');

exports.uploadLogo = async (req, res) => {
  const { clientId } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ success: false, message: 'Nenhum ficheiro enviado.' });
  }

  const fileExt = file.originalname.split('.').pop();
  const filePath = `logos/${clientId}-${Date.now()}.${fileExt}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('client-files')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    if (uploadError) throw uploadError;

    await supabase
      .from('clients')
      .update({
        logo_path: filePath,
        logo_original_name: file.originalname,
        logo_mime_type: file.mimetype,
        logo_size: file.size,
        logo_uploaded_at: new Date(),
      })
      .eq('id', clientId);

    const { data: urlData } = supabase.storage.from('client-files').getPublicUrl(filePath);

    res.status(200).json({
      success: true,
      message: 'Logo enviada com sucesso.',
      logo_url: `${process.env.API_URL}/clients/${clientId}/logo`, // Retorna a URL do nosso proxy
    });

  } catch (error) {
    console.error(`[Upload Logo Error] - ClientId: ${clientId}. Error:`, error);
    res.status(500).json({ success: false, message: 'Erro ao enviar a logo.', error: error.message });
  }
};

exports.getLogo = async (req, res) => {
  const { clientId } = req.params;
  
  try {
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('logo_path, logo_mime_type')
      .eq('id', clientId)
      .single();

    if (clientError || !client || !client.logo_path) {
      return res.status(404).send('Logo não encontrada');
    }

    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('client-files')
      .download(client.logo_path);

    if (downloadError) throw downloadError;
    
    const fileBuffer = Buffer.from(await fileBlob.arrayBuffer());

    res.writeHead(200, {
      'Content-Type': client.logo_mime_type,
      'Content-Length': fileBuffer.length
    });

    res.end(fileBuffer);

  } catch (error) {
    console.error(`[Get Logo Error] - ClientId: ${clientId}. Error:`, error);
    res.status(500).send('Erro ao obter a logo.');
  }
};

exports.deleteLogo = async (req, res) => {
    const { clientId } = req.params;

    try {
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('logo_path')
            .eq('id', clientId)
            .single();

        if (clientError || !client || !client.logo_path) {
            return res.status(404).json({ success: false, message: 'Logo não encontrada para exclusão.' });
        }

        const { error: storageError } = await supabase.storage
            .from('client-files')
            .remove([client.logo_path]);

        if (storageError) throw storageError;

        await supabase
            .from('clients')
            .update({
                logo_path: null,
                logo_original_name: null,
                logo_mime_type: null,
                logo_size: null,
                logo_uploaded_at: null,
            })
            .eq('id', clientId);

        res.status(200).json({ success: true, message: 'Logo removida com sucesso.' });

    } catch (error) {
        console.error(`[Delete Logo Error] - ClientId: ${clientId}. Error:`, error);
        res.status(500).json({ success: false, message: 'Erro ao remover a logo.' });
    }
};

// Configuração do multer para upload em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB para logos
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

class ClientLogoController {
  
  // Middleware do multer
  static uploadMiddleware = upload.single('logo');

  // Upload de logo do cliente
  static async uploadLogo(req, res) {
    try {
      const { clientId } = req.params;
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'Nenhum arquivo foi enviado'
        });
      }

      // Verificar se o cliente existe
      const { data: clientExists, error: clientError } = await supabase
        .from('clients')
        .select('id, logo_path')
        .eq('id', clientId)
        .single();

      if (clientError || !clientExists) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado'
        });
      }

      // Se já existe uma logo, deletar a antiga do Storage
      if (clientExists.logo_path) {
        const { error: deleteError } = await supabase.storage
          .from('client-logos')
          .remove([clientExists.logo_path]);
        
        if (deleteError) {
          console.warn('Erro ao deletar logo antiga:', deleteError);
        }
      }

      // Gerar nome único para o arquivo
      const fileExtension = path.extname(req.file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = `${clientId}/${fileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('client-logos')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (uploadError) {
        console.error('Erro no upload para Supabase:', uploadError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload da logo'
        });
      }

      // Atualizar informações da logo no banco
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          logo_path: filePath,
          logo_original_name: req.file.originalname,
          logo_mime_type: req.file.mimetype,
          logo_size: req.file.size,
          logo_uploaded_at: new Date().toISOString(),
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (updateError) {
        // Tentar deletar o arquivo do Storage em caso de erro
        await supabase.storage.from('client-logos').remove([filePath]);
        
        console.error('Erro ao salvar informações da logo:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao salvar informações da logo'
        });
      }

      res.json({
        success: true,
        message: 'Logo atualizada com sucesso',
        logo: {
          path: filePath,
          original_name: req.file.originalname,
          mime_type: req.file.mimetype,
          size: req.file.size
        }
      });

    } catch (error) {
      console.error('Erro no upload de logo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Obter logo do cliente
  static async getLogo(req, res) {
    try {
      const { clientId } = req.params;

      // Buscar informações da logo do cliente
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('logo_path, logo_original_name, logo_mime_type')
        .eq('id', clientId)
        .single();

      if (clientError || !client) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado'
        });
      }

      if (!client.logo_path) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não possui logo'
        });
      }

      // Buscar arquivo do Supabase Storage
      const { data, error } = await supabase.storage
        .from('client-logos')
        .download(client.logo_path);

      if (error) {
        console.error('Erro ao buscar logo:', error);
        return res.status(404).json({
          success: false,
          error: 'Logo não encontrada no storage'
        });
      }

      // Configurar headers para exibição
      res.setHeader('Content-Type', client.logo_mime_type);
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 ano

      // Converter ArrayBuffer para Buffer e enviar
      const buffer = Buffer.from(await data.arrayBuffer());
      res.send(buffer);

    } catch (error) {
      console.error('Erro ao buscar logo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }

  // Deletar logo do cliente
  static async deleteLogo(req, res) {
    try {
      const { clientId } = req.params;
      const userId = req.user.id;

      // Buscar informações da logo
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('logo_path')
        .eq('id', clientId)
        .single();

      if (clientError || !client) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado'
        });
      }

      if (!client.logo_path) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não possui logo'
        });
      }

      // Deletar do Supabase Storage
      const { error: deleteError } = await supabase.storage
        .from('client-logos')
        .remove([client.logo_path]);

      if (deleteError) {
        console.error('Erro ao deletar do storage:', deleteError);
      }

      // Limpar informações da logo no banco
      const { error: updateError } = await supabase
        .from('clients')
        .update({
          logo_path: null,
          logo_original_name: null,
          logo_mime_type: null,
          logo_size: null,
          logo_uploaded_at: null,
          updated_by: userId,
          updated_at: new Date().toISOString()
        })
        .eq('id', clientId);

      if (updateError) {
        console.error('Erro ao limpar informações da logo:', updateError);
        return res.status(500).json({
          success: false,
          error: 'Erro ao remover logo'
        });
      }

      res.json({
        success: true,
        message: 'Logo removida com sucesso'
      });

    } catch (error) {
      console.error('Erro ao deletar logo:', error);
      res.status(500).json({
        success: false,
        error: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = ClientLogoController;
const { supabase } = require('../config/database');

class ContractServiceCommentModel {
  /**
   * Creates a new comment for a contract service
   * @param {object} commentData - The comment data
   * @param {number} userId - The ID of the user creating the comment
   * @returns {Promise<object>} The newly created comment
   */
  async create(commentData, userId) {
    const { contract_service_id, comment } = commentData;

    try {
      const { data, error } = await supabase
        .from('contract_service_comments')
        .insert([{
          contract_service_id,
          user_id: userId,
          comment
        }])
        .select(`
          *,
          user:users(id, name, email)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao criar comentário:', error);
      throw error;
    }
  }

  /**
   * Get all comments for a specific contract service
   * @param {number} contractServiceId - The ID of the contract service
   * @returns {Promise<Array>} List of comments
   */
  async getByContractServiceId(contractServiceId) {
    try {
      const { data, error } = await supabase
        .from('contract_service_comments')
        .select(`
          *,
          user:users(id, name, email)
        `)
        .eq('contract_service_id', contractServiceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('❌ Erro ao buscar comentários:', error);
      throw error;
    }
  }

  /**
   * Update a comment
   * @param {number} id - The comment ID
   * @param {string} comment - The new comment text
   * @param {number} userId - The ID of the user updating (must be the author)
   * @returns {Promise<object>} The updated comment
   */
  async update(id, comment, userId) {
    try {
      // First verify the user owns the comment
      const { data: existingComment, error: checkError } = await supabase
        .from('contract_service_comments')
        .select('user_id')
        .eq('id', id)
        .single();

      if (checkError) throw checkError;
      if (existingComment.user_id !== userId) {
        throw new Error('Unauthorized: You can only edit your own comments');
      }

      const { data, error } = await supabase
        .from('contract_service_comments')
        .update({ comment })
        .eq('id', id)
        .select(`
          *,
          user:users(id, name, email)
        `)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('❌ Erro ao atualizar comentário:', error);
      throw error;
    }
  }

  /**
   * Delete a comment
   * @param {number} id - The comment ID
   * @param {number} userId - The ID of the user deleting (must be the author or admin)
   * @param {boolean} isAdmin - Whether the user is an admin
   * @returns {Promise<boolean>} True on success
   */
  async delete(id, userId, isAdmin = false) {
    try {
      if (!isAdmin) {
        // Verify the user owns the comment
        const { data: existingComment, error: checkError } = await supabase
          .from('contract_service_comments')
          .select('user_id')
          .eq('id', id)
          .single();

        if (checkError) throw checkError;
        if (existingComment.user_id !== userId) {
          throw new Error('Unauthorized: You can only delete your own comments');
        }
      }

      // Get all attachments before deleting the comment
      const { data: attachments, error: attachmentsError } = await supabase
        .from('service_comment_attachments')
        .select('file_path')
        .eq('comment_id', id)
        .eq('is_active', true);

      if (attachmentsError) {
        console.error('⚠️ Erro ao buscar anexos:', attachmentsError);
      }

      // Delete the comment (CASCADE DELETE will handle attachment records in DB)
      const { error } = await supabase
        .from('contract_service_comments')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Clean up Storage files after successful comment deletion
      if (attachments && attachments.length > 0) {
        const filePaths = attachments.map(att => att.file_path);
        
        // Remove files from Supabase Storage (best effort - don't fail if storage deletion fails)
        try {
          const { error: storageError } = await supabase.storage
            .from('attachments')
            .remove(filePaths);

          if (storageError) {
            console.warn('⚠️ Erro ao remover arquivos do storage:', storageError);
            // Don't throw - comment is already deleted
          }
        } catch (storageErr) {
          console.warn('⚠️ Erro ao limpar storage:', storageErr);
          // Don't throw - comment is already deleted
        }
      }

      return true;
    } catch (error) {
      console.error('❌ Erro ao deletar comentário:', error);
      throw error;
    }
  }
}

module.exports = new ContractServiceCommentModel();
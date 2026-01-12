const { supabase } = require('../config/database');

class HabitoController {
  /**
   * Buscar hábitos de um mês específico
   */
  async getHabitsByMonth(req, res) {
    try {
      const { year, month } = req.params;
      const userId = req.user.id;

      const { data, error } = await supabase
        .from('habit_months')
        .select('*')
        .eq('user_id', userId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Se não houver dados, retornar null
      if (!data) {
        return res.json(null);
      }

      res.json(data);
    } catch (error) {
      console.error('Error fetching habits:', error);
      res.status(500).json({ error: 'Failed to fetch habits', details: error.message });
    }
  }

  /**
   * Salvar hábitos do mês
   */
  async saveHabits(req, res) {
    try {
      const { year, month, days, habits } = req.body;
      const userId = req.user.id;

      // Verificar se já existe um registro para esse mês
      const { data: existing, error: selectError } = await supabase
        .from('habit_months')
        .select('id')
        .eq('user_id', userId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();

      if (selectError && selectError.code !== 'PGRST116') {
        throw selectError;
      }

      let result;

      if (existing) {
        // Atualizar registro existente
        const { data, error } = await supabase
          .from('habit_months')
          .update({
            days: parseInt(days),
            habits: habits,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Criar novo registro
        const { data, error } = await supabase
          .from('habit_months')
          .insert({
            user_id: userId,
            year: parseInt(year),
            month: parseInt(month),
            days: parseInt(days),
            habits: habits
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      res.json({
        success: true,
        message: 'Hábitos salvos com sucesso!',
        data: result
      });
    } catch (error) {
      console.error('Error saving habits:', error);
      res.status(500).json({
        error: 'Failed to save habits',
        details: error.message
      });
    }
  }

  /**
   * Atualizar hábitos do mês
   */
  async updateHabits(req, res) {
    try {
      const { id } = req.params;
      const { days, habits } = req.body;
      const userId = req.user.id;

      // Verificar se o registro pertence ao usuário
      const { data: existing, error: checkError } = await supabase
        .from('habit_months')
        .select('id')
        .eq('id', parseInt(id))
        .eq('user_id', userId)
        .single();

      if (checkError || !existing) {
        return res.status(404).json({ error: 'Habit month not found or unauthorized' });
      }

      // Atualizar
      const { data, error } = await supabase
        .from('habit_months')
        .update({
          days: parseInt(days),
          habits: habits,
          updated_at: new Date().toISOString()
        })
        .eq('id', parseInt(id))
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        message: 'Hábitos atualizados com sucesso!',
        data
      });
    } catch (error) {
      console.error('Error updating habits:', error);
      res.status(500).json({ error: 'Failed to update habits', details: error.message });
    }
  }

  /**
   * Deletar hábitos de um mês
   */
  async deleteHabits(req, res) {
    try {
      const { year, month } = req.params;
      const userId = req.user.id;

      const { error } = await supabase
        .from('habit_months')
        .delete()
        .eq('user_id', userId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month));

      if (error) throw error;

      res.json({
        success: true,
        message: 'Hábitos deletados com sucesso!'
      });
    } catch (error) {
      console.error('Error deleting habits:', error);
      res.status(500).json({ error: 'Failed to delete habits', details: error.message });
    }
  }

  /**
   * Obter todos os meses com hábitos cadastrados
   */
  async getAllMonths(req, res) {
    try {
      const userId = req.user.id;

      const { data, error } = await supabase
        .from('habit_months')
        .select('id, year, month, days')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;

      res.json(data || []);
    } catch (error) {
      console.error('Error fetching months:', error);
      res.status(500).json({ error: 'Failed to fetch months', details: error.message });
    }
  }
}

module.exports = new HabitoController();

const { supabase } = require('../config/database');

class Entrevista {
  static async create(entrevistaData) {
    try {
      const { data, error } = await supabase
        .from('entrevistas')
        .insert([entrevistaData])
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating entrevista:', error);
      throw error;
    }
  }

  static async findById(id) {
    try {
      const { data, error } = await supabase
        .from('entrevistas')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error finding entrevista by id:', error);
      throw error;
    }
  }

  static async findByVagaCandidatoId(vagaCandidatoId) {
    try {
      const { data, error } = await supabase
        .from('entrevistas')
        .select('*')
        .eq('vaga_candidato_id', vagaCandidatoId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error finding entrevistas by vaga_candidato_id:', error);
      throw error;
    }
  }

  static async update(id, entrevistaData) {
    try {
      const { data, error } = await supabase
        .from('entrevistas')
        .update(entrevistaData)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating entrevista:', error);
      throw error;
    }
  }

  static async delete(id) {
    try {
      const { error } = await supabase
        .from('entrevistas')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting entrevista:', error);
      throw error;
    }
  }
}

module.exports = Entrevista;

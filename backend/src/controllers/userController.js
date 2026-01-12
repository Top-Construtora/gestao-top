const userService = require('../services/userService');
const { validateCreateUser, validateUpdateUser } = require('../utils/validators');

class UserController {
  async create(req, res, next) {
    try {
      const { error, value } = validateCreateUser(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user = await userService.createUser(value, req.user.role, req.user.id);
      
      res.status(201).json({
        message: 'Usuário criado com sucesso',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req, res, next) {
    try {
      const filters = {};
      
      if (req.query.is_active !== undefined) {
        filters.is_active = req.query.is_active === 'true';
      }
      
      const users = await userService.listUsers(req.user.role, filters);
      res.json({ users });
    } catch (error) {
      next(error);
    }
  }

  async update(req, res, next) {
    try {
      const { id } = req.params;
      const { error, value } = validateUpdateUser(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const user = await userService.updateUser(id, value, req.user.role);
      res.json({
        message: 'Usuário atualizado com sucesso',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  async softDelete(req, res, next) {
    try {
      const { id } = req.params;
      await userService.softDeleteUser(id, req.user.role);
      res.status(200).json({ message: 'Usuário desativado e anonimizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async hardDelete(req, res, next) {
    try {
      const { id } = req.params;
      await userService.hardDeleteUser(id, req.user.role);
      res.status(200).json({ message: 'Usuário excluído permanentemente.' });
    } catch (error) {
      next(error);
    }
  }

  async toggleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const user = await userService.toggleUserStatus(id, req.user.role);
      res.json({
        message: 'Status do usuário alterado com sucesso',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  async listForAssignment(req, res, next) {
    try {
      const users = await User.findAll();
      res.json(users.map(u => ({ 
        id: u.id, 
        name: u.name, 
        email: u.email, 
        profile_picture_path: u.profile_picture_path 
      })));
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { id } = req.params;
      await userService.resetPasswordForUser(id);
      
      res.json({
        message: 'Senha do usuário resetada com sucesso. Um email foi enviado com a nova senha temporária.'
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTeamVisibility(req, res, next) {
    try {
      const { id } = req.params;
      const { show_in_team } = req.body;
      
      if (typeof show_in_team !== 'boolean') {
        return res.status(400).json({ error: 'show_in_team deve ser um valor booleano' });
      }
      
      const user = await userService.updateTeamVisibility(id, show_in_team, req.user.role);
      res.json({
        message: 'Visibilidade na equipe atualizada com sucesso',
        user
      });
    } catch (error) {
      next(error);
    }
  }

  async getTeamMembers(req, res, next) {
    try {
      const teamMembers = await userService.getTeamMembers();
      res.json({ teamMembers });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new UserController();
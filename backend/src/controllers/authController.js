const authService = require('../services/authService');
const { 
  validateLogin, 
  validateForgotPassword, 
  validateResetPassword,
  validateChangePassword,
  validateFirstLoginPassword 
} = require('../utils/validators');

class AuthController {
  async login(req, res, next) {
    try {
      const { error, value } = validateLogin(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await authService.login(value.email, value.password);
      
      // Se precisa trocar senha, retornar status especial
      if (result.user.must_change_password) {
        return res.status(200).json({
          message: 'Login realizado. Necessário trocar senha.',
          must_change_password: true,
          ...result
        });
      }

      res.json({
        message: 'Login realizado com sucesso',
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { error, value } = validateResetPassword(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await authService.resetPassword(value.token, value.password);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async validateResetToken(req, res, next) {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Código é obrigatório' });
      }

      const result = await authService.validateResetToken(token);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { error, value } = validateChangePassword(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await authService.changePassword(
        req.user.id,
        value.current_password,
        value.new_password
      );
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async changePasswordFirstLogin(req, res, next) {
    try {
      const { error, value } = validateFirstLoginPassword(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await authService.changePasswordFirstLogin(
        req.user.id,
        value.new_password
      );
      
      res.json({
        message: 'Senha alterada com sucesso',
        ...result
      });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const { error, value } = validateForgotPassword(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const result = await authService.forgotPassword(value.email);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      console.log(`Usuário ${req.user.id} realizou logout em ${new Date().toISOString()}`);
      
      res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async me(req, res) {
    // Buscar dados atualizados do usuário
    const { User } = require('../models');
    const user = await User.findById(req.user.id);
    
    res.json({ 
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: req.user.role,
        permissions: req.user.permissions,
        must_change_password: user.must_change_password || false,
        last_password_change: user.last_password_change,
        first_login_at: user.first_login_at
      }
    });
  }
}

module.exports = new AuthController();
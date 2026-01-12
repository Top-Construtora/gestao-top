const Joi = require('joi');

// ========================================
// VALIDAÇÕES DE ETAPAS DE SERVIÇO
// ========================================

const validateCreateServiceStage = (data) => {
  const schema = Joi.object({
    service_id: Joi.number().integer().positive().required(),
    name: Joi.string().min(1).max(255).required(),
    description: Joi.string().max(1000).optional().allow(null, ''),
    category: Joi.string().max(100).optional().allow(null, ''),
    sort_order: Joi.number().integer().positive().default(1)
  });

  return schema.validate(data);
};

const validateUpdateServiceStage = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(1).max(255),
    description: Joi.string().max(1000).allow(null, ''),
    category: Joi.string().max(100).allow(null, ''),
    sort_order: Joi.number().integer().positive(),
    status: Joi.string().valid('pending', 'completed'),
    is_active: Joi.boolean()
  }).min(1); // Pelo menos um campo deve ser fornecido

  return schema.validate(data);
};

const validateServiceStageId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().positive().required()
  });

  return schema.validate(data);
};

const validateServiceId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().positive().required()
  });

  return schema.validate(data);
};

const validateStageStatusUpdate = (data) => {
  const schema = Joi.object({
    status: Joi.string().valid('pending', 'completed').required()
  });

  return schema.validate(data);
};

const validateMultipleStageUpdates = (data) => {
  const schema = Joi.array().items(
    Joi.object({
      id: Joi.number().integer().positive().required(),
      name: Joi.string().min(1).max(255),
      description: Joi.string().max(1000).allow(null, ''),
      category: Joi.string().max(100).allow(null, ''),
      sort_order: Joi.number().integer().positive(),
      status: Joi.string().valid('pending', 'completed')
    })
  ).min(1);

  return schema.validate(data);
};

module.exports = {
  validateCreateServiceStage,
  validateUpdateServiceStage,
  validateServiceStageId,
  validateServiceId,
  validateStageStatusUpdate,
  validateMultipleStageUpdates
};
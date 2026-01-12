const Joi = require('joi');

// ========================================
// VALIDAÇÕES DE USUÁRIOS
// ========================================

const validateLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  });

  return schema.validate(data);
};

const validateCreateUser = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).optional(),
    name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('admin', 'admin_gerencial', 'consultor_rs', 'user').default('user'),
    cargo: Joi.string().max(100).optional().allow(null, '')
  });

  return schema.validate(data);
};

const validateUpdateUser = (data) => {
  const schema = Joi.object({
    email: Joi.string().email(),
    password: Joi.string().min(6),
    name: Joi.string().min(2).max(100),
    role: Joi.string().valid('admin', 'admin_gerencial', 'consultor_rs', 'user'),
    is_active: Joi.boolean(),
    cargo: Joi.string().max(100).optional().allow(null, '')
  }).min(1); // Pelo menos um campo deve ser fornecido

  return schema.validate(data);
};

const validateForgotPassword = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required()
  });

  return schema.validate(data);
};

const validateResetPassword = (data) => {
  const schema = Joi.object({
    token: Joi.string().length(6).pattern(/^\d{6}$/).required()
      .messages({
        'string.length': 'Código deve ter exatamente 6 dígitos',
        'string.pattern.base': 'Código deve conter apenas números',
        'any.required': 'Código é obrigatório'
      }),
    password: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
      .required()
      .messages({
        'string.min': 'Senha deve ter pelo menos 8 caracteres',
        'string.pattern.base': 'A senha deve conter letra maiúscula, minúscula, número e um caractere especial',
        'any.required': 'Senha é obrigatória'
      })
  });

  return schema.validate(data);
};

const validateChangePassword = (data) => {
  const schema = Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string()
      // UPDATED: Added pattern for stronger password validation
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
      .required()
      .messages({
        'string.min': 'A nova senha deve ter pelo menos 8 caracteres',
        'string.pattern.base': 'A nova senha deve conter letra maiúscula, minúscula, número e um caractere especial',
        'any.required': 'A nova senha é obrigatória'
      })
      .custom((value, helpers) => {
        if (value === helpers.state.ancestors[0].current_password) {
          return helpers.error('any.invalid');
        }
        return value;
      }, 'A nova senha deve ser diferente da atual')
  });

  return schema.validate(data);
};

const validateFirstLoginPassword = (data) => {
  const schema = Joi.object({
    new_password: Joi.string().min(6).required()
  });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES DE EMPRESAS
// ========================================

const validateCreateCompany = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255).required()
      .messages({
        'string.empty': 'Nome da empresa é obrigatório',
        'string.min': 'Nome deve ter pelo menos 2 caracteres',
        'string.max': 'Nome não pode exceder 255 caracteres'
      }),

    employee_count: Joi.number().integer().min(1).max(10000000).optional().allow(null)
      .messages({
        'number.min': 'Número de funcionários deve ser pelo menos 1',
        'number.max': 'Número de funcionários não pode exceder 10 milhões',
        'number.integer': 'Número de funcionários deve ser um número inteiro'
      }),

    founded_date: Joi.date().max('now').optional().allow(null)
      .messages({
        'date.max': 'Data de fundação não pode ser no futuro'
      }),

    headquarters: Joi.string().min(2).max(255).optional().allow(null)
      .messages({
        'string.min': 'Sede deve ter pelo menos 2 caracteres',
        'string.max': 'Sede não pode exceder 255 caracteres'
      }),

    locations: Joi.array().items(
      Joi.string().min(2).max(255)
        .messages({
          'string.min': 'Cada localização deve ter pelo menos 2 caracteres',
          'string.max': 'Cada localização não pode exceder 255 caracteres'
        })
    ).max(20).optional()
      .messages({
        'array.max': 'Máximo de 20 localizações permitidas'
      }),

    market_sector: Joi.string().min(2).max(255).optional().allow(null)
      .messages({
        'string.min': 'Setor deve ter pelo menos 2 caracteres',
        'string.max': 'Setor não pode exceder 255 caracteres'
      }),

    description: Joi.string().max(10000).optional().allow(null)
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      })
  });

  return schema.validate(data);
};

const validateUpdateCompany = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255)
      .messages({
        'string.empty': 'Nome da empresa não pode ser vazio',
        'string.min': 'Nome deve ter pelo menos 2 caracteres',
        'string.max': 'Nome não pode exceder 255 caracteres'
      }),

    employee_count: Joi.number().integer().min(1).max(10000000).allow(null)
      .messages({
        'number.min': 'Número de funcionários deve ser pelo menos 1',
        'number.max': 'Número de funcionários não pode exceder 10 milhões',
        'number.integer': 'Número de funcionários deve ser um número inteiro'
      }),

    founded_date: Joi.date().max('now').allow(null)
      .messages({
        'date.max': 'Data de fundação não pode ser no futuro'
      }),

    headquarters: Joi.string().min(2).max(255).allow(null)
      .messages({
        'string.min': 'Sede deve ter pelo menos 2 caracteres',
        'string.max': 'Sede não pode exceder 255 caracteres'
      }),

    locations: Joi.array().items(
      Joi.string().min(2).max(255)
        .messages({
          'string.min': 'Cada localização deve ter pelo menos 2 caracteres',
          'string.max': 'Cada localização não pode exceder 255 caracteres'
        })
    ).max(20)
      .messages({
        'array.max': 'Máximo de 20 localizações permitidas'
      }),

    market_sector: Joi.string().min(2).max(255).allow(null)
      .messages({
        'string.min': 'Setor deve ter pelo menos 2 caracteres',
        'string.max': 'Setor não pode exceder 255 caracteres'
      }),

    description: Joi.string().max(10000).allow(null)
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      }),

    is_active: Joi.boolean()
      .messages({
        'boolean.base': 'Status deve ser verdadeiro ou falso'
      })

  }).min(1) // Pelo menos um campo deve ser fornecido
    .messages({
      'object.min': 'Pelo menos um campo deve ser fornecido para atualização'
    });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES AUXILIARES PARA EMPRESAS
// ========================================

const validateCompanySearch = (data) => {
  const schema = Joi.object({
    search: Joi.string().min(2).max(100).optional(),
    market_sector: Joi.string().max(255).optional(),
    is_active: Joi.boolean().optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  });

  return schema.validate(data);
};

const validateCompanyId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID deve ser um número positivo',
        'number.integer': 'ID deve ser um número inteiro',
        'any.required': 'ID é obrigatório'
      })
  });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES DE SERVIÇOS
// ========================================

const validateCreateService = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255).required()
      .messages({
        'string.empty': 'Nome do serviço é obrigatório',
        'string.min': 'Nome deve ter pelo menos 2 caracteres',
        'string.max': 'Nome não pode exceder 255 caracteres'
      }),

    duration_amount: Joi.number().integer().min(1).when('duration_unit', {
      is: 'Projeto',
      then: Joi.optional().allow(null),
      otherwise: Joi.required()
    }).messages({
      'any.required': 'A quantidade de duração é obrigatória',
      'number.min': 'A quantidade de duração deve ser de no mínimo 1'
    }),
    duration_unit: Joi.string().valid('dias', 'semanas', 'meses', 'encontros', 'Projeto').required().messages({
      'any.required': 'A unidade de duração é obrigatória',
      'any.only': 'Unidade de duração inválida'
    }),

    category: Joi.string().min(2).max(100).optional()
      .messages({
        'string.min': 'Categoria deve ter pelo menos 2 caracteres',
        'string.max': 'Categoria não pode exceder 100 caracteres'
      }),

    description: Joi.string().max(10000).optional().allow(null, '')
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      }),

    subtitle: Joi.string().max(255).optional().allow(null, '')
      .messages({
        'string.max': 'Subtítulo não pode exceder 255 caracteres'
      }),

    summary: Joi.string().max(500).optional().allow(null, '')
      .messages({
        'string.max': 'Resumo não pode exceder 500 caracteres'
      })
  });

  return schema.validate(data);
};

const validateUpdateService = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255)
      .messages({
        'string.empty': 'Nome do serviço não pode ser vazio',
        'string.min': 'Nome deve ter pelo menos 2 caracteres',
        'string.max': 'Nome não pode exceder 255 caracteres'
      }),

    duration_amount: Joi.alternatives().conditional('duration_unit', {
      is: 'Projeto',
      then: Joi.any().valid(null).optional(),
      otherwise: Joi.number().integer().min(1)
    }),

    duration_unit: Joi.string().valid('dias', 'semanas', 'meses', 'encontros', 'Projeto'),

    category: Joi.string().min(2).max(100)
      .messages({
        'string.min': 'Categoria deve ter pelo menos 2 caracteres',
        'string.max': 'Categoria não pode exceder 100 caracteres'
      }),

    description: Joi.string().max(10000).allow(null, '')
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      }),

    subtitle: Joi.string().max(255).optional().allow(null, '')
      .messages({
        'string.max': 'Subtítulo não pode exceder 255 caracteres'
      }),

    summary: Joi.string().max(500).optional().allow(null, '')
      .messages({
        'string.max': 'Resumo não pode exceder 500 caracteres'
      }),

    is_active: Joi.boolean()
      .messages({
        'boolean.base': 'Status deve ser verdadeiro ou falso'
      })

  }).min(1)
    .messages({
      'object.min': 'Pelo menos um campo deve ser fornecido para atualização'
    });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES AUXILIARES PARA SERVIÇOS
// ========================================

const validateServiceSearch = (data) => {
  const schema = Joi.object({
    search: Joi.string().min(2).max(100).optional(),
    category: Joi.string().max(100).optional(),
    is_active: Joi.boolean().optional(),
    exclude_internal: Joi.string().valid('true', 'false').optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  });

  return schema.validate(data);
};

const validateServiceId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID deve ser um número positivo',
        'number.integer': 'ID deve ser um número inteiro',
        'any.required': 'ID é obrigatório'
      })
  });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES DE CONTRATOS
// ========================================

const validateCreateContract = (data) => {
  // Para contratos de R&S, permitir total_value = 0 (será calculado após aprovação do candidato)
  const isRecruitment = data.type === 'Recrutamento & Seleção';

  const schema = Joi.object({
    contract_number: Joi.string().max(50).optional().allow(null, ''),
    client_id: Joi.number().integer().min(1).required()
      .messages({
        'any.required': 'Empresa é obrigatória'
      }),
    type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção').required(),
    start_date: Joi.date().required()
      .messages({
        'any.required': 'Data de início é obrigatória'
      }),
    end_date: Joi.date().min(Joi.ref('start_date')).optional().allow(null),
    services: Joi.array().items(
      Joi.object({
        service_id: Joi.number().integer().min(1).required(),
        unit_value: Joi.number().min(0).precision(2).optional().allow(0),
        total_value: Joi.number().min(0).precision(2).optional().allow(0),
        // Campos para serviços de Recrutamento & Seleção
        recruitmentPercentages: Joi.object({
          administrativo_gestao: Joi.number().min(0).max(200).optional(),
          comercial: Joi.number().min(0).max(200).optional(),
          operacional: Joi.number().min(0).max(200).optional(),
          estagio_jovem: Joi.number().min(0).max(200).optional()
        }).optional()
      })
    ).min(1).required()
      .messages({
        'array.min': 'Pelo menos um serviço deve ser adicionado'
      }),
    // Para R&S, permitir valor 0 ou positivo. Para outros tipos, apenas positivo
    total_value: isRecruitment
      ? Joi.number().min(0).precision(2).optional()
          .messages({
            'number.min': 'Valor total deve ser zero ou positivo'
          })
      : Joi.number().positive().precision(2).optional()
          .messages({
            'number.positive': 'Valor total deve ser positivo'
          }),
    notes: Joi.string().max(2000).optional().allow(null, ''),
    assigned_users: Joi.array().items(
      Joi.number().integer().min(1)
    ).optional(),
    payment_method: Joi.string().max(100).optional().allow(null, '')
      .messages({
        'string.max': 'Forma de pagamento não pode exceder 100 caracteres'
      }),
    payment_method_1: Joi.string().max(100).optional().allow(null, '')
      .messages({
        'string.max': 'Primeira forma de pagamento não pode exceder 100 caracteres'
      }),
    payment_method_2: Joi.string().max(100).optional().allow(null, '')
      .messages({
        'string.max': 'Segunda forma de pagamento não pode exceder 100 caracteres'
      }),
    barter_type: Joi.string().valid('percentage', 'value').optional().allow(null)
      .messages({
        'any.only': 'Tipo de permuta deve ser "percentage" ou "value"'
      }),
    barter_value: Joi.number().positive().precision(2).optional().allow(null)
      .messages({
        'number.positive': 'Valor da permuta deve ser positivo'
      }),
    barter_percentage: Joi.number().min(0).max(100).precision(2).optional().allow(null)
      .messages({
        'number.min': 'Porcentagem deve ser no mínimo 0',
        'number.max': 'Porcentagem não pode exceder 100'
      }),
    secondary_payment_method: Joi.string().max(100).optional().allow(null, '')
      .messages({
        'string.max': 'Forma de pagamento secundária não pode exceder 100 caracteres'
      }),
    expected_payment_date: Joi.date().optional().allow(null)
      .messages({
        'date.base': 'Data prevista para pagamento deve ser uma data válida'
      }),
    first_installment_date: Joi.date().optional().allow(null)
      .messages({
        'date.base': 'Data da primeira parcela deve ser uma data válida'
      }),
    payment_status: Joi.string().valid('pago', 'pendente').default('pendente')
      .messages({
        'any.only': 'Status de pagamento deve ser "pago" ou "pendente"'
      }),
    installment_count: Joi.number().integer().min(1).max(18).default(1)
      .messages({
        'number.min': 'Número de parcelas deve ser pelo menos 1',
        'number.max': 'Número de parcelas não pode exceder 18',
        'number.integer': 'Número de parcelas deve ser um número inteiro'
      }),
    installments: Joi.array().items(
      Joi.object({
        id: Joi.number().integer().optional(),
        installment_number: Joi.number().integer().optional(),
        due_date: Joi.date().required()
          .messages({
            'any.required': 'Data de vencimento da parcela é obrigatória'
          }),
        amount: Joi.number().positive().precision(2).required()
          .messages({
            'any.required': 'Valor da parcela é obrigatório',
            'number.positive': 'Valor da parcela deve ser positivo'
          }),
        payment_status: Joi.string().valid('pago', 'pendente', 'atrasado').optional(),
        paid_date: Joi.date().optional().allow(null),
        paid_amount: Joi.number().min(0).precision(2).optional().allow(null),
        notes: Joi.string().max(500).optional().allow(null, '')
          .messages({
            'string.max': 'Observações da parcela não podem exceder 500 caracteres'
          })
      })
    ).optional()
      .messages({
        'array.base': 'Parcelas devem ser uma lista válida'
      })
  });

  return schema.validate(data);
};

const validateUpdateContract = (data) => {
  const schema = Joi.object({
    contract_number: Joi.string().max(50),
    client_id: Joi.number().integer().min(1),
    type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção'),
    start_date: Joi.date(),
    end_date: Joi.date().allow(null)
      .when('start_date', {
        is: Joi.exist(),
        then: Joi.date().min(Joi.ref('start_date'))
      }),
    status: Joi.string().valid('active', 'completed', 'cancelled', 'suspended'),
    services: Joi.array().items(
      Joi.object({
        service_id: Joi.number().integer().min(1).required(),
        unit_value: Joi.number().min(0).precision(2).optional().allow(0),
        total_value: Joi.number().min(0).precision(2).optional().allow(0),
        // Campos para serviços de Recrutamento & Seleção
        recruitmentPercentages: Joi.object({
          administrativo_gestao: Joi.number().min(0).max(200).optional(),
          comercial: Joi.number().min(0).max(200).optional(),
          operacional: Joi.number().min(0).max(200).optional(),
          estagio_jovem: Joi.number().min(0).max(200).optional()
        }).optional()
      })
    ).min(1),
    notes: Joi.string().max(2000).allow(null, ''),
    assigned_users: Joi.array().items(
      Joi.number().integer().min(1)
    ).optional(),
    payment_method: Joi.string().max(100).allow(null, '')
      .messages({
        'string.max': 'Forma de pagamento não pode exceder 100 caracteres'
      }),
    payment_method_1: Joi.string().max(100).allow(null, '')
      .messages({
        'string.max': 'Primeira forma de pagamento não pode exceder 100 caracteres'
      }),
    payment_method_2: Joi.string().max(100).allow(null, '')
      .messages({
        'string.max': 'Segunda forma de pagamento não pode exceder 100 caracteres'
      }),
    barter_type: Joi.string().valid('percentage', 'value').allow(null)
      .messages({
        'any.only': 'Tipo de permuta deve ser "percentage" ou "value"'
      }),
    barter_value: Joi.number().positive().precision(2).allow(null)
      .messages({
        'number.positive': 'Valor da permuta deve ser positivo'
      }),
    barter_percentage: Joi.number().min(0).max(100).precision(2).allow(null)
      .messages({
        'number.min': 'Porcentagem deve ser no mínimo 0',
        'number.max': 'Porcentagem não pode exceder 100'
      }),
    secondary_payment_method: Joi.string().max(100).allow(null, '')
      .messages({
        'string.max': 'Forma de pagamento secundária não pode exceder 100 caracteres'
      }),
    expected_payment_date: Joi.date().allow(null)
      .messages({
        'date.base': 'Data prevista para pagamento deve ser uma data válida'
      }),
    first_installment_date: Joi.date().allow(null)
      .messages({
        'date.base': 'Data da primeira parcela deve ser uma data válida'
      }),
    payment_status: Joi.string().valid('pago', 'pendente')
      .messages({
        'any.only': 'Status de pagamento deve ser "pago" ou "pendente"'
      }),
    installment_count: Joi.number().integer().min(1).max(18)
      .messages({
        'number.min': 'Número de parcelas deve ser pelo menos 1',
        'number.max': 'Número de parcelas não pode exceder 18',
        'number.integer': 'Número de parcelas deve ser um número inteiro'
      }),
    installments: Joi.array().items(
      Joi.object({
        id: Joi.number().integer().optional(),
        installment_number: Joi.number().integer().optional(),
        due_date: Joi.date().required(),
        amount: Joi.number().positive().precision(2).required(),
        payment_status: Joi.string().valid('pago', 'pendente', 'atrasado').optional(),
        paid_date: Joi.date().optional().allow(null),
        paid_amount: Joi.number().min(0).precision(2).optional().allow(null),
        notes: Joi.string().max(500).optional().allow(null, '')
      })
    ).optional()
  }).min(1)
    .messages({
      'object.min': 'Pelo menos um campo deve ser fornecido para atualização'
    });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES DE PROPOSTAS
// ========================================

const validateCreateProposal = (data) => {
  const schema = Joi.object({
    client_id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID do cliente deve ser um número positivo',
        'number.integer': 'ID do cliente deve ser um número inteiro',
        'any.required': 'Cliente é obrigatório'
      }),
    type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção').default('Full')
      .messages({
        'any.only': 'Tipo de proposta deve ser: Full, Pontual, Individual ou Recrutamento & Seleção'
      }),
    services: Joi.array().items(
      Joi.object({
        service_id: Joi.number().integer().min(1).required(),
        unit_value: Joi.number().min(0).precision(2).optional().allow(0),
        total_value: Joi.number().min(0).precision(2).optional().allow(0),
        sort_order: Joi.number().integer().min(0).optional(),
        // Campos para serviços de Recrutamento & Seleção
        recruitmentPercentages: Joi.object({
          administrativo_gestao: Joi.number().min(0).max(200).optional(),
          comercial: Joi.number().min(0).max(200).optional(),
          operacional: Joi.number().min(0).max(200).optional(),
          estagio_jovem: Joi.number().min(0).max(200).optional()
        }).optional()
      })
    ).min(1).required()
      .messages({
        'array.min': 'Pelo menos um serviço deve ser adicionado'
      }),
    end_date: Joi.alternatives().try(
      Joi.date().iso(),
      Joi.string().allow(''),
      Joi.allow(null)
    ).optional(),
    max_installments: Joi.number().integer().min(1).max(18).default(12)
      .messages({
        'number.min': 'Número máximo de parcelas deve ser pelo menos 1',
        'number.max': 'Número máximo de parcelas não pode ser maior que 18',
        'number.integer': 'Número máximo de parcelas deve ser um número inteiro'
      }),
    vista_discount_percentage: Joi.number().min(0).max(100).precision(2).default(6)
      .messages({
        'number.min': 'Desconto à vista deve ser no mínimo 0%',
        'number.max': 'Desconto à vista não pode exceder 100%'
      }),
    prazo_discount_percentage: Joi.number().min(0).max(100).precision(2).default(0)
      .messages({
        'number.min': 'Desconto à prazo deve ser no mínimo 0%',
        'number.max': 'Desconto à prazo não pode exceder 100%'
      }),
    valor_global: Joi.number().min(0).precision(2).optional().allow(null)
      .messages({
        'number.min': 'Valor global deve ser no mínimo 0',
        'number.precision': 'Valor global não pode ter mais de 2 casas decimais'
      }),
    usar_valor_global: Joi.boolean().default(false)
      .messages({
        'boolean.base': 'Usar valor global deve ser verdadeiro ou falso'
      })
  }).unknown(true); // Allow extra fields like client data

  return schema.validate(data);
};

const validateUpdateProposal = (data) => {
  const schema = Joi.object({
    client_id: Joi.number().integer().min(1),
    type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção')
      .messages({
        'any.only': 'Tipo de proposta deve ser: Full, Pontual, Individual ou Recrutamento & Seleção'
      }),
    status: Joi.string().valid('draft', 'sent', 'signed', 'rejected', 'expired', 'converted', 'contraproposta')
      .messages({
        'any.only': 'Status deve ser: draft, sent, signed, rejected, expired, converted ou contraproposta'
      }),
    services: Joi.array().items(
      Joi.object({
        service_id: Joi.number().integer().min(1).required(),
        unit_value: Joi.number().min(0).precision(2).optional().allow(0),
        total_value: Joi.number().min(0).precision(2).optional().allow(0),
        sort_order: Joi.number().integer().min(0).optional(),
        // Campos para serviços de Recrutamento & Seleção
        recruitmentPercentages: Joi.object({
          administrativo_gestao: Joi.number().min(0).max(200).optional(),
          comercial: Joi.number().min(0).max(200).optional(),
          operacional: Joi.number().min(0).max(200).optional(),
          estagio_jovem: Joi.number().min(0).max(200).optional()
        }).optional()
      })
    ).min(1),
    end_date: Joi.alternatives().try(
      Joi.date().iso(),
      Joi.string().allow(''),
      Joi.allow(null)
    ).optional(),
    max_installments: Joi.number().integer().min(1).max(18)
      .messages({
        'number.min': 'Número máximo de parcelas deve ser pelo menos 1',
        'number.max': 'Número máximo de parcelas não pode ser maior que 18',
        'number.integer': 'Número máximo de parcelas deve ser um número inteiro'
      }),
    vista_discount_percentage: Joi.number().min(0).max(100).precision(2)
      .messages({
        'number.min': 'Desconto à vista deve ser no mínimo 0%',
        'number.max': 'Desconto à vista não pode exceder 100%'
      }),
    prazo_discount_percentage: Joi.number().min(0).max(100).precision(2)
      .messages({
        'number.min': 'Desconto à prazo deve ser no mínimo 0%',
        'number.max': 'Desconto à prazo não pode exceder 100%'
      }),
    valor_global: Joi.number().min(0).precision(2).optional().allow(null)
      .messages({
        'number.min': 'Valor global deve ser no mínimo 0',
        'number.precision': 'Valor global não pode ter mais de 2 casas decimais'
      }),
    usar_valor_global: Joi.boolean()
      .messages({
        'boolean.base': 'Usar valor global deve ser verdadeiro ou falso'
      })
  }).unknown(true).min(1)
    .messages({
      'object.min': 'Pelo menos um campo deve ser fornecido para atualização'
    });

  return schema.validate(data);
};

// ========================================
// VALIDAÇÕES AUXILIARES PARA CONTRATOS
// ========================================

const validateContractSearch = (data) => {
  const schema = Joi.object({
    search: Joi.string().min(1).max(100).optional(),
    status: Joi.string().valid('active', 'completed', 'cancelled', 'suspended').optional(),
    type: Joi.string().valid('Full', 'Pontual', 'Individual', 'Recrutamento & Seleção').optional(),
    client_id: Joi.number().integer().min(1).optional(),
    start_date: Joi.date().optional(),
    end_date: Joi.date().optional(),
    dateType: Joi.string().valid('created_at', 'start_date', 'end_date').optional(),
    month: Joi.string().pattern(/^(1[0-2]|[1-9])$/).optional(),
    year: Joi.string().pattern(/^\d{4}$/).optional(),
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0)
  });

  return schema.validate(data);
};

const validateContractId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID deve ser um número positivo',
        'number.integer': 'ID deve ser um número inteiro',
        'any.required': 'ID é obrigatório'
      })
  });

  return schema.validate(data);
};

// ========================================
// CATEGORIAS DE SERVIÇOS PREDEFINIDAS
// ========================================

const SERVICE_CATEGORIES = [
  'Geral',
  'Consultoria',
  'Treinamento',
  'Mentoria',
  'Diagnóstico',
  'Desenvolvimento',
  'Gestão',
  'Estratégia',
  'Engenharia'
];

// ========================================
// TIPOS E STATUS DE CONTRATOS
// ========================================

const CONTRACT_TYPES = ['Full', 'Pontual', 'Individual', 'Recrutamento & Seleção'];
const CONTRACT_STATUSES = ['active', 'completed', 'cancelled', 'suspended'];

// ========================================
// SETORES DE MERCADO PREDEFINIDOS
// ========================================

const MARKET_SECTORS = [
  'Tecnologia',
  'Saúde',
  'Educação',
  'Varejo',
  'Finanças',
  'Indústria',
  'Serviços',
  'Construção',
  'Agricultura',
  'Energia',
  'Transporte',
  'Telecomunicações',
  'Alimentação',
  'Turismo',
  'Entretenimento',
  'Consultoria',
  'Imobiliário',
  'Automotivo',
  'Farmacêutico',
  'Têxtil',
  'Outros'
];

const validateMarketSector = (sector) => {
  return MARKET_SECTORS.includes(sector);
};

// Adicionar no validator
const validateContractAssignments = (data) => {
  const schema = Joi.object({
    assigned_users: Joi.array().items(
      Joi.number().integer().min(1)
    ).optional()
      .messages({
        'array.base': 'Usuários atribuídos deve ser uma lista'
      })
  });

  return schema.validate(data);
};

// Função auxiliar para validar campos obrigatórios
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = [];
  
  for (const field of requiredFields) {
    if (!data[field] || (typeof data[field] === 'string' && data[field].trim() === '')) {
      missingFields.push(field);
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
};

// ========================================
// VALIDAÇÕES DE ETAPAS DE SERVIÇOS
// ========================================

const validateCreateServiceStage = (data) => {
  const schema = Joi.object({
    service_id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID do serviço deve ser um número positivo',
        'number.integer': 'ID do serviço deve ser um número inteiro',
        'any.required': 'ID do serviço é obrigatório'
      }),
    name: Joi.string().min(2).max(255).required()
      .messages({
        'string.min': 'Nome da etapa deve ter pelo menos 2 caracteres',
        'string.max': 'Nome da etapa não pode exceder 255 caracteres',
        'any.required': 'Nome da etapa é obrigatório'
      }),
    description: Joi.string().max(10000).optional().allow(null, '')
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      }),
    sort_order: Joi.number().integer().min(1).default(1)
      .messages({
        'number.min': 'Ordem deve ser pelo menos 1',
        'number.integer': 'Ordem deve ser um número inteiro'
      })
  });

  return schema.validate(data);
};

const validateUpdateServiceStage = (data) => {
  const schema = Joi.object({
    name: Joi.string().min(2).max(255)
      .messages({
        'string.min': 'Nome da etapa deve ter pelo menos 2 caracteres',
        'string.max': 'Nome da etapa não pode exceder 255 caracteres'
      }),
    description: Joi.string().max(10000).optional().allow(null, '')
      .messages({
        'string.max': 'Descrição não pode exceder 10000 caracteres'
      }),
    sort_order: Joi.number().integer().min(1)
      .messages({
        'number.min': 'Ordem deve ser pelo menos 1',
        'number.integer': 'Ordem deve ser um número inteiro'
      }),
    status: Joi.string().valid('pending', 'completed')
      .messages({
        'any.only': 'Status deve ser "pending" ou "completed"'
      }),
    is_active: Joi.boolean()
  }).min(1)
    .messages({
      'object.min': 'Pelo menos um campo deve ser fornecido para atualização'
    });

  return schema.validate(data);
};

const validateServiceStageId = (data) => {
  const schema = Joi.object({
    id: Joi.number().integer().min(1).required()
      .messages({
        'number.min': 'ID deve ser um número positivo',
        'number.integer': 'ID deve ser um número inteiro',
        'any.required': 'ID é obrigatório'
      })
  });

  return schema.validate(data);
};

const validateStageStatusUpdate = (data) => {
  const schema = Joi.object({
    status: Joi.string().valid('pending', 'completed').required()
      .messages({
        'any.only': 'Status deve ser "pending" ou "completed"',
        'any.required': 'Status é obrigatório'
      })
  });

  return schema.validate(data);
};

const validateMultipleStageUpdates = (data) => {
  const schema = Joi.object({
    updates: Joi.array().items(
      Joi.object({
        id: Joi.number().integer().min(1).required(),
        status: Joi.string().valid('pending', 'completed').required()
      })
    ).min(1).required()
      .messages({
        'array.min': 'Pelo menos uma atualização deve ser fornecida'
      })
  });

  return schema.validate(data);
};

module.exports = {
  // Validações de usuários
  validateLogin,
  validateCreateUser,
  validateUpdateUser,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateFirstLoginPassword,

  // Validações de empresas
  validateCreateCompany,
  validateUpdateCompany,
  validateCompanySearch,
  validateCompanyId,

  // Validações de serviços
  validateCreateService,
  validateUpdateService,
  validateServiceSearch,
  validateServiceId,


  // Validações de propostas
  validateCreateProposal,
  validateUpdateProposal,

  // Validações de contratos
  validateCreateContract,
  validateUpdateContract,
  validateContractSearch,
  validateContractId,


  // Auxiliares
  validateMarketSector,
  validateRequiredFields,
  MARKET_SECTORS,
  SERVICE_CATEGORIES,
  CONTRACT_TYPES,
  CONTRACT_STATUSES
};
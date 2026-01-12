const errorHandler = (err, req, res, next) => {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  // Erros de validação do Joi
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: {
        message: 'Dados inválidos',
        details: err.details
      }
    });
  }

  // Erros de banco de dados
  if (err.code === '23505') { // Violação de unique constraint
    return res.status(409).json({
      error: {
        message: 'Registro duplicado'
      }
    });
  }

  // Erro padrão
  const status = err.status || 500;
  const message = err.message || 'Erro interno do servidor';

  res.status(status).json({
    error: {
      message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    }
  });
};

module.exports = errorHandler;
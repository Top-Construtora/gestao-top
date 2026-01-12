module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRE || '7d',
    resetExpiresIn: process.env.JWT_RESET_EXPIRE || '1h'
  },
  bcrypt: {
    saltRounds: 10
  }
};
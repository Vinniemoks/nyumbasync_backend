module.exports = {
  jwt: {
    secret: process.env.JWT_SECRET || '12345678',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }
};

module.exports = {
  email: {
    from: process.env.EMAIL_FROM || 'no-reply@nyumbasync.com',
    support: process.env.SUPPORT_EMAIL || 'support@nyumbasync.com',
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: process.env.SMTP_PORT || 2525,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'your-smtp-username',
        pass: process.env.SMTP_PASS || 'your-smtp-password'
      }
    }
  },
  client: {
    url: process.env.CLIENT_URL || 'http://localhost:3000'
  }
};
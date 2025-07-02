// Whitelist Kenyan common domains and mobile apps
const allowedOrigins = [
  'https://nyumbasync.com',
  'https://app.nyumbasync.com',
  'capacitor://localhost', // For mobile apps
  'ionic://localhost',
  /\.ke$/, // All .ke domains
];

module.exports = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => {
      if (typeof o === 'string') return origin === o;
      return o.test(origin);
    })) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS - Kenya service only'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['x-auth-token', 'Content-Type'],
  exposedHeaders: ['x-mpesa-receipt'],
  maxAge: 86400 // 24hrs
};

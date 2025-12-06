// ----------------------------
// Load Dependencies
// ----------------------------
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { testConnection } = require('./config/prisma');

dotenv.config();

const app = express();

// ----------------------------
// CORS Configuration
// ----------------------------
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:3063',
  process.env.FRONTEND_URL
].filter(Boolean);

const isDevelopment = process.env.NODE_ENV !== 'production';

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (isDevelopment && origin.includes('localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// ----------------------------
// Logging Middleware
// ----------------------------
app.use((req, res, next) => {
  console.log(
    `${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${
      req.headers.origin || 'none'
    }`
  );
  next();
});

// ----------------------------
// Body Parsers
// ----------------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ----------------------------
// Serve Uploads
// ----------------------------
app.use(
  '/uploads',
  express.static('uploads', {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  })
);

// ----------------------------
// API Routes
// ----------------------------
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin-recovery.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/positions', require('./routes/positions.routes'));
app.use('/api/candidates', require('./routes/candidates.routes'));
app.use('/api/voters', require('./routes/voters.routes'));
app.use('/api/verify', require('./routes/verification.routes'));
app.use('/api/vote', require('./routes/votes.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/email', require('./routes/email-test.routes'));

// ----------------------------
// Health Check
// ----------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'E-Voting System API is running'
  });
});

// ----------------------------
// Error Handler
// ----------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ----------------------------
// 404 Handler
// ----------------------------
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ----------------------------
// Start Server
// ----------------------------
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testConnection();

    const env = process.env.NODE_ENV || 'development';
    const host = 'localhost';
    const url = `http://localhost:${PORT}`;

    app.listen(PORT, host, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${env}`);
      console.log(`🌐 Access at: ${url}`);
      console.log(`✅ CORS enabled for localhost`);
    });
  } catch (error) {
    console.error('\n❌ Failed to start server due to database connection error');
    process.exit(1);
  }
}

startServer();

module.exports = app;

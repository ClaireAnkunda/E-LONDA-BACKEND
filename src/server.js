const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { testConnection } = require('./config/prisma');

// dotenv is already loaded in prisma.js, but load again to ensure all vars are available
dotenv.config();

const app = express();

// Middleware
// CORS - allow local development origins
const allowedOrigins = [
  'http://localhost:3000',   // React default
  'http://localhost:5173',   // Vite default
  'http://localhost:3063',   // Custom port
  process.env.FRONTEND_URL    // From environment if set
].filter(Boolean);

// In development, allow all localhost origins
const isDevelopment = process.env.NODE_ENV !== 'production';

//use cors
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      callback(null, true);
      return;
    }
    
    // In development, allow any localhost origin
    if (isDevelopment && origin.includes('localhost')) {
      callback(null, true);
      return;
    }
    
    // In production, check allowed origins
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Request logging middleware (for debugging)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files with proper headers
app.use('/uploads', express.static('uploads', {
  maxAge: '1y', // Cache images for 1 year
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set CORS headers for images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin-recovery.routes')); // Admin recovery
app.use('/api/users', require('./routes/users.routes')); // Admin user management
app.use('/api/positions', require('./routes/positions.routes'));
app.use('/api/candidates', require('./routes/candidates.routes'));
app.use('/api/voters', require('./routes/voters.routes')); // Voter management
app.use('/api/verify', require('./routes/verification.routes'));
app.use('/api/vote', require('./routes/votes.routes'));
app.use('/api/reports', require('./routes/reports.routes'));
app.use('/api/email', require('./routes/email-test.routes')); // Email test endpoint

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'E-Voting System API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
    // Stack traces not exposed in production for security
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Test database connection before starting server
async function startServer() {
  try {
    // Test database connection
    await testConnection();
    
    // Start server - always run on localhost for local development
    const env = process.env.NODE_ENV || 'development';
    const host = 'localhost'; // Always use localhost for local development
    const accessUrl = `http://localhost:${PORT}`;
    
    app.listen(PORT, host, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📝 Environment: ${env}`);
      console.log(`🌐 Access at: ${accessUrl}`);
      console.log(`✅ CORS enabled for localhost origins`);
    });
  } catch (error) {
    console.error('\n❌ Failed to start server due to database connection error');
    process.exit(1);
  }
}

startServer();

module.exports = app;


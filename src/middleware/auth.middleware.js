const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma');

// ---------------------------------------------------------
// Authentication Middleware
// ---------------------------------------------------------
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Validate header
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user from DB
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true
      }
    });

    // Check user validity
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ error: 'Invalid or inactive user' });
    }

    req.user = user;
    next();

  } catch (error) {
    switch (error.name) {
      case 'JsonWebTokenError':
        return res.status(401).json({ error: 'Invalid token' });
      case 'TokenExpiredError':
        return res.status(401).json({ error: 'Token expired' });
      default:
        return res.status(500).json({ error: 'Authentication error' });
    }
  }
};

// ---------------------------------------------------------
// Authorization Middleware (Role-based)
// ---------------------------------------------------------
const authorize = (...roles) => {
  const allowedRoles = roles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

module.exports = { authenticate, authorize };

const jwt = require('jsonwebtoken');
const { prisma } = require('../config/prisma'); // Assuming this imports the configured Prisma client

// --- Middleware Definitions ---
// These functions are designed to sit between the request initiation and the route handler,
// ensuring that the request is properly authenticated and authorized.

// ---------------------------------------------------------
// 🛡️ 1. Authentication Middleware: Verifies JWT and loads user data
// ---------------------------------------------------------
/**
 * Middleware function to authenticate a user based on a JWT provided in the Authorization header.
 *
 * It performs three main tasks:
 * 1. Checks for a valid "Bearer" token format.
 * 2. Verifies and decodes the JWT using the secret key.
 * 3. Fetches the corresponding active user from the database.
 *
 * If successful, it attaches the user object to `req.user` and calls `next()`.
 */
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        // 1. Validate Header Format
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided or invalid format (Expected: Bearer <token>)' });
        }

        const token = authHeader.slice(7); // Remove "Bearer " prefix to isolate the JWT

        // 2. Verify and Decode JWT
        // Throws an error (e.g., JsonWebTokenError, TokenExpiredError) if validation fails
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 3. Fetch User from Database
        // Use the userId embedded in the token payload to retrieve user details
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                email: true,
                name: true,
                role: true, // Crucial for authorization later
                status: true
            }
        });

        // 4. Check User Validity (Existence and Status)
        if (!user || user.status !== 'ACTIVE') {
            return res.status(401).json({ error: 'Invalid or inactive user' });
        }

        // 5. Success: Attach user object to the request for subsequent middleware/routes
        req.user = user;
        next(); // Proceed to the next middleware or route handler

    } catch (error) {
        // --- JWT Error Handling ---
        switch (error.name) {
            case 'JsonWebTokenError':
                console.error('JWT Verification Failed:', error.message);
                return res.status(401).json({ error: 'Invalid token' });
            case 'TokenExpiredError':
                console.error('Token Expired:', error.message);
                return res.status(401).json({ error: 'Token expired' });
            default:
                console.error('Authentication error (General):', error);
                return res.status(500).json({ error: 'Authentication error' });
        }
    }
};

// ---------------------------------------------------------
// 🔑 2. Authorization Middleware: Checks user roles
// ---------------------------------------------------------
/**
 * Higher-order function that returns a middleware to enforce role-based access control (RBAC).
 *
 * It should always be used AFTER the `authenticate` middleware, as it relies on `req.user`.
 *
 * @param {...(string|string[])} roles - A list of allowed role strings (e.g., 'ADMIN', 'USER').
 * @returns {Function} Express middleware function (req, res, next)
 */
const authorize = (...roles) => {
    // Normalize input (handles array or individual arguments) into a flat array of allowed roles
    const allowedRoles = roles.flat();

    return (req, res, next) => {
        // 1. Check for Authentication
        // Ensures that the `authenticate` middleware ran successfully
        if (!req.user) {
            // This should ideally not happen if middleware is chained correctly, 
            // but acts as a safeguard.
            return res.status(401).json({ error: 'Authentication required' });
        }

        // 2. Check for Role Match
        // Compares the authenticated user's role against the allowed list
        if (!allowedRoles.includes(req.user.role)) {
            // If the user's role is not found in the allowed list, deny access
            console.warn(`Access denied for user ${req.user.id} with role ${req.user.role}. Required roles: ${allowedRoles.join(', ')}`);
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        // 3. Success: User is authorized
        next(); // Proceed to the final route handler
    };
};

// --- Exports ---
module.exports = { authenticate, authorize };

// db-service.js

// 🌟 Step 1: Get the configuration ready
// Load environment variables (like our crucial DATABASE_URL) from the .env file
require('dotenv').config(); 
// The main ORM (Object-Relational Mapper) for database operations
const { PrismaClient } = require('@prisma/client');
// The direct, promise-based MySQL driver (we use this for a quick connection check/ping)
const mysql = require('mysql2/promise');
// A standard Node.js utility to safely and easily break down the connection string
const { URL } = require('url'); 

/**
 * 🛠️ The MySQL Connection Manager Class
 * Purpose: This class is a dedicated helper to manage the raw 'mysql2' connection pool.
 * We use this pool primarily for a fast, direct connection test (ping) because 
 * it's often faster and more direct than waiting for Prisma's internal connection.
 */
class MySQLManager {
  /**
   * ⚙️ Static Method: parseConfig(url)
   * Think of this as the 'URL Decoder Ring'. It takes the messy `DATABASE_URL` string
   * and converts it into the clean, structured configuration object that the 'mysql2' 
   * library needs to establish a connection.
   * @param {string} url - The MySQL connection URL (e.g., 'mysql://user:pass@host:port/db').
   * @returns {mysql.PoolOptions} The configuration for the mysql2 pool.
   * @throws {Error} If the URL is missing or improperly formatted.
   */
  static parseConfig(url) {
    if (!url) {
      // Must have the database address!
      throw new Error('DATABASE_URL is not set.');
    }
    
    let dbUrl;
    try {
      // Safely parse the URL string into a structured object
      dbUrl = new URL(url);
    } catch (e) {
      throw new Error(`Invalid DATABASE_URL format: ${e.message}`);
    }

    if (dbUrl.protocol !== 'mysql:') {
      // Basic sanity check: we only support MySQL here.
      throw new Error('Unsupported protocol. Expected "mysql:".');
    }

    return {
      host: dbUrl.hostname,
      // Get port, defaulting to 3306 if it's missing (MySQL standard)
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: dbUrl.password,
      // The database name is everything after the first slash in the path
      database: dbUrl.pathname.slice(1), 
      // Standard pool configuration settings
      waitForConnections: true,
      connectionLimit: 10, // A reasonable pool size
      queueLimit: 0,
    };
  }

  /**
   * Constructor: Sets up the pool using the parsed config.
   * @param {string} databaseUrl - The raw URL string.
   */
  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.poolConfig = MySQLManager.parseConfig(databaseUrl);
    // Create the connection pool instance immediately
    this.pool = mysql.createPool(this.poolConfig);
  }

  /**
   * 🏓 Method: ping()
   * This is the fast connection test! It attempts to get a connection from the pool 
   * and sends a simple ping command to the database server. If it fails, an error is thrown.
   * @returns {Promise<void>}
   */
  async ping() {
    let connection;
    try {
      // Get a connection instance from the pool
      connection = await this.pool.getConnection();
      // Send the ping command
      await connection.ping();
    } finally {
      // ⚠️ CRITICAL: Always release the connection back to the pool, even on error!
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * 🛑 Method: end()
   * Shuts down the mysql2 connection pool gracefully.
   * @returns {Promise<void>}
   */
  async end() {
    return this.pool.end();
  }
}

/**
 * ⚙️ Centralized DB Service Class
 * Purpose: This is the main orchestrator. It holds both the Prisma client (for app logic)
 * and the MySQLManager (for connection testing/maintenance) and manages the lifecycle.
 */
class DBService {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      // Can't run without the address!
      throw new Error('DATABASE_URL is not defined in environment variables.');
    }

    // 1. Initialize our direct connection manager for testing/pinging
    this.mysqlManager = new MySQLManager(databaseUrl);
    
    // 2. Initialize the Prisma Client (the main ORM we use for queries)
    this.prisma = new PrismaClient({
      log: ['error'], // In production, we usually only care about serious errors
      // Tell Prisma which database to use (it reads the schema.prisma file, but this confirms the URL)
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  /**
   * 🚨 Private Helper: _logConnectionError(error, dbUrl)
   * This function handles the messy job of interpreting database errors (which are notoriously vague)
   * and printing helpful, human-readable troubleshooting steps based on the error code.
   * It's a lifesaver for developers setting up the environment.
   * @param {Error} error - The connection error object.
   * @param {string} dbUrl - The full database URL.
   */
  _logConnectionError(error, dbUrl) {
    console.error('\n❌ Database connection failed!');
    
    // Logic to strip out nested errors (like AggregateError) to find the original cause
    let actualError = error;
    if (error.name === 'AggregateError' && Array.isArray(error.errors) && error.errors.length > 0) {
      actualError = error.errors[0];
    }
    
    const errorMessage = actualError.message || error.message || error.toString() || 'Unknown error';
    const errorCode = actualError.code || actualError.errno || 'N/A';
    
    console.error('🔴 Error Message:', errorMessage);
    console.error('🔴 Error Code:', errorCode);

    // --- The Humanized Troubleshooting Suggestions ---
    if (['ECONNREFUSED', 'P1001', 'ER_CONN_REFUSED'].includes(errorCode)) {
      console.error('⚠️  Connection refused: The database server is likely **not running** or is **inaccessible** on the specified host/port.');
      console.error('   → Check if MySQL/MariaDB server process is running (e.g., via Task Manager, Services, or Docker status).');
    } else if (['ER_ACCESS_DENIED_ERROR', 'P1000'].includes(errorCode)) {
      console.error('⚠️  Access denied: Invalid database **username** or **password**.');
      console.error('   → Verify credentials in your `.env` file match a valid MySQL user.');
    } else if (['ENOTFOUND', 'EAI_AGAIN', 'P1003'].includes(errorCode)) {
      console.error('⚠️  Host resolution error: Cannot resolve the database **hostname**.');
      console.error('   → Check the host in `DATABASE_URL` (e.g., `localhost` or an IP address).');
    } else if (['ETIMEDOUT', 'P1002'].includes(errorCode)) {
      console.error('⚠️  Connection timeout: The database server did not respond within the time limit.');
      console.error('   → Could be firewall/network issue or an overloaded server.');
    } else if (errorMessage.includes('DATABASE_URL')) {
      console.error('⚠️  DATABASE_URL configuration error. Check the format.');
    } else {
      console.error('⚠️  An unexpected error occurred. Review the stack trace for details.');
    }
    
    console.error('\n📋 Recommended Steps:');
    console.error('   1. **Start MySQL Server:** Ensure the service is active.');
    console.error('   2. **Check .env:** Verify `DATABASE_URL` format: `mysql://user:pass@host:port/dbname`');
    console.error('   3. **Check Credentials/Host/Port:** Double-check all parts of the URL are correct.');
    console.error('   4. **Create Database:** Ensure the database name exists on the server.');
  }


  /**
   * ✅ Method: testConnection()
   * Executes the connection check and logs the result cleanly.
   * @returns {Promise<boolean>} True if connection is successful.
   */
  async testConnection() {
    const dbUrl = this.mysqlManager.databaseUrl;
    try {
      // Use the fast ping method from our MySQLManager
      await this.mysqlManager.ping();
      
      const urlObj = new URL(dbUrl);
      
      console.log('✅ Database connected successfully!');
      // Show the user where exactly we connected, without exposing the password
      console.log(`📍 Connected to: ${urlObj.hostname}:${urlObj.port || 3306}/${urlObj.pathname.slice(1)}`);
      
      return true;
    } catch (error) {
      // Log the detailed troubleshooting guide
      this._logConnectionError(error, dbUrl);
      
      // Re-throw the error so the calling application knows the service failed
      throw error; 
    }
  }

  /**
   * 🔌 Method: disconnect()
   * Handles the graceful shutdown of ALL database resources (Prisma and mysql2 pool).
   * We use Promise.allSettled to ensure both attempts are made, even if one fails.
   * @returns {Promise<void>}
   */
  async disconnect() {
    await Promise.allSettled([
        this.prisma.$disconnect(), // Tell Prisma to close its connections
        this.mysqlManager.end() // Tell the mysql2 pool to close
    ]);
    console.log('🔌 Database connections gracefully closed.');
  }
}

// ----------------------------------------------------
// 🚀 Initialization and Export (Making it usable by the rest of the application)
// ----------------------------------------------------

// Create a single, shared instance of our DB service
const dbService = new DBService();
// Destructure the key exports for convenience
const { prisma } = dbService; // The main client for querying
const { testConnection, disconnect } = dbService; // The utility functions

// 🧘 Graceful Shutdown Handlers
// These ensure that if the Node.js process closes (either normally or via Ctrl+C/kill),
// we cleanly close the database connections to prevent memory leaks or open sockets.
process.on('beforeExit', disconnect);
process.on('SIGINT', async () => { await disconnect(); process.exit(0); }); // Ctrl+C
process.on('SIGTERM', async () => { await disconnect(); process.exit(0); }); // OS kill command

// Export the necessary parts for the application to use
export { prisma, testConnection }; 
// If your project requires CommonJS (older Node.js):
// module.exports = { prisma, testConnection };

// db-service.js

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');
const { URL } = require('url'); // Import URL for cleaner parsing

/**
 * 🛠️ MySQL Connection Manager Class (for testing and direct connection)
 */
class MySQLManager {
  /**
   * Parses the DATABASE_URL environment variable into a mysql2 pool config object.
   * @param {string} url - The MySQL connection URL.
   * @returns {mysql.PoolOptions} The configuration for the mysql2 pool.
   * @throws {Error} If the URL is missing or invalid.
   */
  static parseConfig(url) {
    if (!url) {
      throw new Error('DATABASE_URL is not set.');
    }
    
    let dbUrl;
    try {
      dbUrl = new URL(url);
    } catch (e) {
      throw new Error(`Invalid DATABASE_URL format: ${e.message}`);
    }

    if (dbUrl.protocol !== 'mysql:') {
      throw new Error('Unsupported protocol. Expected "mysql:".');
    }

    return {
      host: dbUrl.hostname,
      port: parseInt(dbUrl.port) || 3306,
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbUrl.pathname.slice(1), // Remove leading '/'
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    };
  }

  constructor(databaseUrl) {
    this.databaseUrl = databaseUrl;
    this.poolConfig = MySQLManager.parseConfig(databaseUrl);
    this.pool = mysql.createPool(this.poolConfig);
  }

  /**
   * Tests the database connection by pinging the server.
   * @returns {Promise<void>}
   */
  async ping() {
    let connection;
    try {
      connection = await this.pool.getConnection();
      await connection.ping();
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }

  /**
   * Ends the mysql2 connection pool.
   * @returns {Promise<void>}
   */
  async end() {
    return this.pool.end();
  }
}

/**
 * ⚙️ Centralized Connection Service
 */
class DBService {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not defined in environment variables.');
    }

    // 1. mysql2 pool for fast connection testing and raw queries (if needed)
    this.mysqlManager = new MySQLManager(databaseUrl);
    
    // 2. Prisma Client for ORM operations
    this.prisma = new PrismaClient({
      log: ['error'], 
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }

  /**
   * Centralized logic to display connection failure details and troubleshooting.
   * @param {Error} error - The connection error object.
   * @param {string} dbUrl - The full database URL for parsing (to detect config errors).
   */
  _logConnectionError(error, dbUrl) {
    console.error('\n❌ Database connection failed!');
    
    // Handle AggregateError (from some internal node/promise rejections)
    let actualError = error;
    if (error.name === 'AggregateError' && Array.isArray(error.errors) && error.errors.length > 0) {
      actualError = error.errors[0];
      if (error.errors.length > 1) {
        console.error(`⚠️  Multiple connection errors (${error.errors.length}) detected.`);
      }
    }
    
    const errorMessage = actualError.message || error.message || error.toString() || 'Unknown error';
    const errorCode = actualError.code || actualError.errno || 'N/A';
    
    console.error('🔴 Error Message:', errorMessage);
    console.error('🔴 Error Code:', errorCode);

    // --- Suggestive Troubleshooting ---
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
   * Tests the database connection using the faster mysql2 pool.
   * @returns {Promise<boolean>} True if connection is successful, false otherwise.
   */
  async testConnection() {
    const dbUrl = this.mysqlManager.databaseUrl;
    try {
      await this.mysqlManager.ping();
      
      const urlObj = new URL(dbUrl);
      
      console.log('✅ Database connected successfully!');
      console.log(`📍 Connected to: ${urlObj.hostname}:${urlObj.port || 3306}/${urlObj.pathname.slice(1)}`);
      
      return true;
    } catch (error) {
      this._logConnectionError(error, dbUrl);
      
      // Re-throw the error after logging for external handling
      throw error; 
    }
  }

  /**
   * Gracefully shuts down both Prisma and mysql2 connections.
   * @returns {Promise<void>}
   */
  async disconnect() {
    await Promise.allSettled([
        this.prisma.$disconnect(),
        this.mysqlManager.end()
    ]);
    console.log('🔌 Database connections gracefully closed.');
  }
}

// ----------------------------------------------------
// 🚀 Initialization and Export
// ----------------------------------------------------

// Create a single instance of the service
const dbService = new DBService();
const { prisma } = dbService;
const { testConnection, disconnect } = dbService;

// Attach graceful shutdown handler
process.on('beforeExit', disconnect);
process.on('SIGINT', async () => { await disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await disconnect(); process.exit(0); });

// Export the Prisma client and the connection test function
export { prisma, testConnection }; 
// Note: Changed to ES module export style for a more modern Node.js context.
// If your project strictly uses require/module.exports, use:
// module.exports = { prisma, testConnection };

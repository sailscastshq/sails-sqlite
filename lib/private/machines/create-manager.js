module.exports = {
  friendlyName: 'Create manager',

  description: 'Build and initialize a connection manager instance for SQLite.',

  inputs: {
    connectionString: {
      description: 'The SQLite connection string (file path).',
      example: 'db/database.sqlite',
      required: true
    },

    meta: {
      friendlyName: 'Meta (custom)',
      description:
        'A dictionary of additional options to pass in when instantiating the SQLite client.',
      example: '==='
    }
  },

  exits: {
    success: {
      description: 'Connected to SQLite successfully.',
      outputFriendlyName: 'Report',
      outputDescription:
        'The `manager` property is a SQLite database instance.',
      outputExample: '==='
    }
  },

  fn: function ({ connectionString, meta }, exits) {
    const Database = require('better-sqlite3')
    const path = require('path')
    const fs = require('fs')

    try {
      // Ensure the directory exists for the database file
      const dbDir = path.dirname(connectionString)
      if (dbDir !== '.' && !fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true })
      }

      // Create database connection with optimized options
      const dbOptions = {
        // Enable verbose mode in development
        verbose:
          meta?.verbose || process.env.NODE_ENV === 'development'
            ? console.log
            : null,
        // Set timeout for database operations
        timeout: meta?.timeout || 5000,
        // Enable read-only mode if specified
        readonly: meta?.readonly || false,
        // Enable file must exist mode if specified
        fileMustExist: meta?.fileMustExist || false,
        ...meta
      }

      const db = new Database(connectionString, dbOptions)

      // Apply recommended performance pragmas for optimal SQLite performance
      const defaultPragmas = {
        // WAL mode for better concurrency (default)
        journal_mode: 'WAL',
        // Synchronous mode for better performance vs durability balance
        synchronous: 'NORMAL',
        // Enable foreign key support
        foreign_keys: 'ON',
        // Set cache size to 256MB (negative value means KB)
        cache_size: -262144,
        // Set page size to 4KB (recommended for modern systems)
        page_size: 4096,
        // Optimize for read-heavy workloads
        optimize: true,
        // Enable memory-mapped I/O
        mmap_size: 268435456, // 256MB
        // Set busy timeout to 30 seconds
        busy_timeout: 30000,
        // Enable automatic index creation for WHERE clauses
        automatic_index: 'ON',
        // Optimize temp store for performance
        temp_store: 'MEMORY'
      }

      // Merge with user-provided pragmas
      const pragmas = { ...defaultPragmas, ...(meta?.pragmas || {}) }

      // Apply pragmas with error handling
      Object.entries(pragmas).forEach(([key, value]) => {
        if (value !== false && value !== null && value !== undefined) {
          try {
            db.pragma(`${key} = ${value}`)
          } catch (pragmaError) {
            console.warn(
              `Warning: Could not set pragma ${key} = ${value}:`,
              pragmaError.message
            )
          }
        }
      })

      // Run ANALYZE to update query planner statistics
      // This is especially important for new databases
      try {
        db.exec('ANALYZE')
      } catch (analyzeError) {
        // ANALYZE might fail on empty database, which is fine
        console.debug(
          'ANALYZE command failed (this is normal for new databases):',
          analyzeError.message
        )
      }

      // Prepare commonly used statements for better performance
      // These will be cached and reused throughout the application lifecycle
      const preparedStatements = new Map()

      // Add helper method to get or create prepared statements
      db.getPreparedStatement = function (sql) {
        if (!preparedStatements.has(sql)) {
          preparedStatements.set(sql, this.prepare(sql))
        }
        return preparedStatements.get(sql)
      }

      // Add transaction helper methods for better performance
      db.runInTransaction = function (fn) {
        return this.transaction(fn)()
      }

      // Add method to optimize database
      db.optimize = function () {
        this.exec('PRAGMA optimize')
        this.exec('VACUUM')
        this.exec('ANALYZE')
      }

      // Add graceful cleanup method
      db.closeGracefully = function () {
        // Clear prepared statements - newer better-sqlite3 doesn't need explicit finalize
        preparedStatements.clear()

        // Close the database connection
        if (this.open) {
          this.close()
        }
      }

      // Set up connection health check
      db.isHealthy = function () {
        try {
          this.prepare('SELECT 1').get()
          return true
        } catch (error) {
          return false
        }
      }

      return exits.success({
        manager: db,
        meta: {
          ...meta,
          connectionString,
          pragmasApplied: pragmas,
          connectionEstablishedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      return exits.error(
        new Error(`Failed to create SQLite database manager: ${error.message}`)
      )
    }
  }
}

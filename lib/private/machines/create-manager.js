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
    try {
      const db = new Database(connectionString, meta)

      // Apply pragmas
      const pragmas = { ...(meta?.pragmas || {}) }
      Object.entries(pragmas).forEach(([key, value]) => {
        if (value !== false) {
          db.pragma(`${key} = ${value}`)
        }
      })

      return exits.success({
        manager: db,
        meta
      })
    } catch (error) {
      return exits.error(error)
    }
  }
}

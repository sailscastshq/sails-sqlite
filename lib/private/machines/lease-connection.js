/**
 * Module dependencies
 */

/**
 * Lease Connection
 *
 * Get a dedicated connection from the datastore for use in transactions.
 * For SQLite, this returns the same connection manager since SQLite is single-threaded.
 */

module.exports = {
  friendlyName: 'Lease connection',

  description:
    'Get a dedicated connection from the datastore for use in transactions.',

  moreInfoUrl:
    'https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md',

  inputs: {
    manager: {
      description: 'The connection manager instance to get a connection from.',
      example: '===',
      required: true
    },

    meta: {
      description: 'Additional options for this query.',
      example: '==='
    }
  },

  exits: {
    failed: {
      description: 'Could not get a connection to the database.'
    },

    success: {
      description: 'A connection was successfully leased.',
      outputExample: '==='
    }
  },

  fn: function leaseConnection(inputs, exits) {
    const manager = inputs.manager
    const meta = inputs.meta || {}

    try {
      // For SQLite, the manager IS the database connection
      // SQLite is single-threaded and doesn't support concurrent transactions
      // The "connection" is actually the database instance
      return exits.success(manager)
    } catch (err) {
      return exits.failed(err)
    }
  }
}

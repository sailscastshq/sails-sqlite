/**
 * Module dependencies
 */

/**
 * Rollback Transaction
 *
 * Rollback the current database transaction on the provided connection.
 */

module.exports = {
  friendlyName: 'Rollback transaction',

  description:
    'Rollback the current database transaction on the provided connection.',

  moreInfoUrl:
    'https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function',

  inputs: {
    connection: {
      description:
        'An active database connection that was acquired from a manager.',
      example: '===',
      required: true
    },

    meta: {
      description: 'Additional options for this query.',
      example: '==='
    }
  },

  fn: function rollbackTransaction(inputs, exits) {
    const db = inputs.connection
    const meta = inputs.meta || {}

    try {
      if (!db.inTransaction) {
        return exits.error(new Error('No active transaction to rollback.'))
      }

      db.prepare('ROLLBACK TRANSACTION').run()

      return exits.success()
    } catch (err) {
      return exits.error(err)
    }
  }
}

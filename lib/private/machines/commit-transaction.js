/**
 * Module dependencies
 */

/**
 * Commit Transaction
 *
 * Commit the current database transaction on the provided connection.
 */

module.exports = {
  friendlyName: 'Commit transaction',

  description:
    'Commit the current database transaction on the provided connection.',

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

  fn: function commitTransaction(inputs, exits) {
    const db = inputs.connection
    const meta = inputs.meta || {}

    try {
      if (!db.inTransaction) {
        return exits.error(new Error('No active transaction to commit.'))
      }

      db.prepare('COMMIT TRANSACTION').run()

      return exits.success()
    } catch (err) {
      return exits.error(err)
    }
  }
}

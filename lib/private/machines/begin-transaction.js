/**
 * Module dependencies
 */

/**
 * Begin Transaction
 *
 * Begin a new database transaction on the provided connection.
 */

module.exports = {
  friendlyName: 'Begin transaction',

  description: 'Begin a new database transaction on the provided connection.',

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

  fn: function beginTransaction(inputs, exits) {
    const db = inputs.connection
    const meta = inputs.meta || {}

    try {
      if (db.inTransaction) {
        return exits.error(
          new Error('Transaction is already active on this connection.')
        )
      }

      db.prepare('BEGIN TRANSACTION').run()

      return exits.success()
    } catch (err) {
      return exits.error(err)
    }
  }
}

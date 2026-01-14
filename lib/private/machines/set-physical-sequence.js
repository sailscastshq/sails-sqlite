module.exports = {
  friendlyName: 'Set physical sequence',

  description: 'Reset an auto-incrementing sequence to the specified value.',

  sideEffects: 'idempotent',

  inputs: {
    connection: require('../constants/connection.input'),
    sequenceName: { example: 'users', required: true },
    sequenceValue: { example: 1, required: true },
    meta: require('../constants/meta.input')
  },

  exits: {
    success: {
      description: 'The sequence was successfully reset.'
    },
    notFound: {
      description: 'Could not find a sequence with the specified name.'
    }
  },

  fn: function (inputs, exits) {
    const { connection: db, sequenceName, sequenceValue } = inputs

    // Parse table name from PostgreSQL-style sequence name
    // e.g., 'invoice_items_id_seq' -> 'invoice_items'
    let tableName = sequenceName
    if (sequenceName.endsWith('_id_seq')) {
      tableName = sequenceName.slice(0, -7)
    } else if (sequenceName.endsWith('_seq')) {
      tableName = sequenceName.slice(0, -4)
    }

    try {
      // Check if the table exists
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        )
        .get(tableName)

      if (!tableExists) {
        return exits.notFound(new Error(`Table '${tableName}' not found.`))
      }

      // Use INSERT OR REPLACE to handle both insert and update in one statement
      db.prepare(
        'INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)'
      ).run(tableName, sequenceValue - 1)

      return exits.success()
    } catch (error) {
      // sqlite_sequence doesn't exist = no AUTOINCREMENT tables yet, which is fine
      if (error.message.includes('no such table: sqlite_sequence')) {
        return exits.success()
      }
      return exits.error(error)
    }
  }
}

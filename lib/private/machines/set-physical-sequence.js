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
    const db = inputs.connection

    // In SQLite, the sequence name is actually the table name
    const tableName = inputs.sequenceName
    const newSequenceValue = inputs.sequenceValue

    try {
      // First, check if the table exists
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
        )
        .get(tableName)

      if (!tableExists) {
        return exits.notFound(new Error(`Table '${tableName}' not found.`))
      }

      // If the table exists, update the sequence
      const updateStmt = db.prepare(
        'UPDATE sqlite_sequence SET seq = ? WHERE name = ?'
      )
      const updateResult = updateStmt.run(newSequenceValue - 1, tableName)

      if (updateResult.changes === 0) {
        // If no rows were updated, it means the table doesn't have an autoincrement column
        // We'll insert a new row in this case
        const insertStmt = db.prepare(
          'INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)'
        )
        insertStmt.run(tableName, newSequenceValue - 1)
      }

      return exits.success()
    } catch (error) {
      // Handle the case where sqlite_sequence doesn't exist
      if (error.message.includes('no such table: sqlite_sequence')) {
        // This is not an error condition - it just means no tables with AUTOINCREMENT have been created yet
        return exits.success()
      }
      return exits.error(error)
    }
  }
}

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
    // Format is: tablename_columnname_seq
    // e.g., 'invoice_items_id_seq' -> table 'invoice_items', column 'id'
    // e.g., 'alter__id_seq' -> table 'alter', column '_id'
    // e.g., 'users_user_id_seq' -> table 'users', column 'user_id'
    //
    // Since we can't reliably split table/column when both contain underscores,
    // we try progressively shorter prefixes until we find an existing table.
    let tableName = null
    if (sequenceName.endsWith('_seq')) {
      const withoutSeq = sequenceName.slice(0, -4) // Remove '_seq'
      // Try progressively shorter prefixes to find the table name
      // Start from the longest possible table name and work backwards
      let candidate = withoutSeq
      while (candidate.includes('_')) {
        const lastUnderscoreIdx = candidate.lastIndexOf('_')
        candidate = candidate.slice(0, lastUnderscoreIdx)
        // Check if this table exists
        const exists = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
          )
          .get(candidate)
        if (exists) {
          tableName = candidate
          break
        }
      }
      // If no table found with underscores, try the full name without _seq
      if (!tableName) {
        const exists = db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = ?"
          )
          .get(withoutSeq)
        if (exists) {
          tableName = withoutSeq
        }
      }
    }

    // If still no table found, exit with notFound
    if (!tableName) {
      return exits.notFound(
        new Error(`Could not find table for sequence '${sequenceName}'.`)
      )
    }

    try {
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

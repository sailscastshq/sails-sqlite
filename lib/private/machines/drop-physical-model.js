module.exports = {
  friendlyName: 'Drop (physical model)',

  description:
    'Completely drop & destroy any traces of a particular physical model (i.e. SQLite table).',

  sideEffects: 'idempotent',

  inputs: {
    connection: require('../constants/connection.input'),
    tableName: require('../constants/table-name.input'),
    meta: require('../constants/meta.input')
  },

  exits: {
    success: {
      description:
        'If such a physical model exists, it was dropped successfully.'
    }
  },

  fn: function (inputs, exits) {
    // Get the SQLite database connection
    const db = inputs.connection

    try {
      // SQL to drop the table
      const dropTableSQL = `DROP TABLE IF EXISTS ${inputs.tableName}`

      // Execute the drop table operation
      db.prepare(dropTableSQL).run()

      // SQL to remove the table's entry from sqlite_sequence (if it exists)
      const cleanSequenceSQL = `DELETE FROM sqlite_sequence WHERE name = ?`

      // Clean up the sqlite_sequence
      db.prepare(cleanSequenceSQL).run(inputs.tableName)

      // Return success, as the main operation (dropping the table) was successful
      return exits.success()
    } catch (error) {
      if (error.message.includes('no such table: sqlite_sequence')) {
        // If sqlite_sequence doesn't exist, it's not an error - just means no autoincrement was used
        return exits.success()
      }
      return exits.error(
        new Error(`Error dropping table ${inputs.tableName}: ${error.message}`)
      )
    }
  }
}

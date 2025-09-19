module.exports = {
  friendlyName: 'Define (physical model)',

  description:
    'Define a physical model (i.e. SQLite table) with the specified characteristics, creating indexes as needed.',

  sideEffects: 'idempotent',

  inputs: {
    connection: require('../constants/connection.input'),
    tableName: require('../constants/table-name.input'),
    columns: {
      description: 'An array of column definitions.',
      required: true,
      example: '==='
    },
    meta: require('../constants/meta.input')
  },

  exits: {
    success: {
      description:
        'New physical model (and any necessary indexes) were created successfully.'
    }
  },

  fn: function (inputs, exits) {
    const db = inputs.connection
    function getSqliteType(columnType) {
      if (!columnType || typeof columnType !== 'string') {
        return 'TEXT' // Default fallback
      }
      switch (columnType.toLowerCase()) {
        case '_string':
        case '_text':
        case '_mediumtext':
        case '_longtext':
          return 'TEXT'
        case '_number':
        case '_numberkey':
        case '_numbertimestamp':
        case 'integer':
        case 'int':
          return 'INTEGER'
        case '_json':
          return 'TEXT'
        case 'float':
        case 'double':
        case 'real':
          return 'REAL'
        case 'boolean':
          return 'INTEGER'
        case 'date':
        case 'datetime':
          return 'TEXT'
        case 'binary':
        case 'blob':
          return 'BLOB'
        default:
          return 'TEXT'
      }
    }

    // Check if we're already in a transaction
    const wasInTransaction = db.inTransaction

    try {
      // Start a transaction only if we're not already in one
      if (!wasInTransaction) {
        db.prepare('BEGIN').run()
      }

      // Build and execute the CREATE TABLE statement
      let createTableSQL = `CREATE TABLE IF NOT EXISTS \`${inputs.tableName}\` (`
      let columnDefs = inputs.columns.map((column) => {
        const columnType = column.columnType ?? column.type
        let def = `\`${column.columnName}\` ${column.autoIncrement ? 'INTEGER' : getSqliteType(columnType)}`
        if (column.autoIncrement) {
          def += ' PRIMARY KEY AUTOINCREMENT NOT NULL'
        }
        if (column.unique && !column.autoIncrement) def += ' UNIQUE'
        return def
      })
      createTableSQL += columnDefs.join(', ') + ')'
      db.prepare(createTableSQL).run()

      // Create indexes
      inputs.columns.forEach((column) => {
        if (column.unique && !column.autoIncrement) {
          const indexSQL = `CREATE UNIQUE INDEX IF NOT EXISTS \`idx_${inputs.tableName}_${column.columnName}\` ON \`${inputs.tableName}\` (\`${column.columnName}\`)`
          db.prepare(indexSQL).run()
        }
      })

      // Commit the transaction only if we started it
      if (!wasInTransaction) {
        db.prepare('COMMIT').run()
      }

      return exits.success()
    } catch (error) {
      // If there's an error, roll back the transaction (only if we started it)
      if (!wasInTransaction) {
        db.prepare('ROLLBACK').run()
      }
      return exits.error(
        new Error(`Error defining table ${inputs.tableName}: ${error.message}`)
      )
    }
  }
}

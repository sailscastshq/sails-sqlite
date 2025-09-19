module.exports = {
  friendlyName: 'Create (record)',

  description: 'Create a new physical record in the SQLite database.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Record (maybe)',
      outputDescription:
        'Either `null` or (if `fetch:true`) a dictionary representing the new record that was created.',
      outputExample: '==='
    },
    notUnique: require('../constants/not-unique.exit')
  },

  fn: function (inputs, exits) {
    // Dependencies
    const util = require('util')
    const _ = require('@sailshq/lodash')
    const processNativeRecord = require('./private/process-native-record')
    const processNativeError = require('./private/process-native-error')
    const reifyValuesToSet = require('./private/reify-values-to-set')

    // Local var for the stage 3 query, for easier access.
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSQLiteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (CREATE RECORD):',
        util.inspect(s3q, { depth: 5 }),
        '\n'
      )
    }

    // Local var for the `tableName`, for clarity.
    const tableName = s3q.using

    // Grab the model definition
    const WLModel = _.find(inputs.dryOrm.models, { tableName: tableName })
    if (!WLModel) {
      return exits.error(
        new Error(
          `No model with that tableName (\`${tableName}\`) has been registered with this adapter.  Were any unexpected modifications made to the stage 3 query?  Could the adapter's internal state have been corrupted?  (This error is usually due to a bug in this adapter's implementation.)`
        )
      )
    }

    // Reify values to set
    try {
      reifyValuesToSet(s3q.newRecord, WLModel, s3q.meta)
    } catch (e) {
      return exits.error(e)
    }

    // Determine whether to fetch or not
    const isFetchEnabled = !!(s3q.meta && s3q.meta.fetch)

    // Create this new record in the SQLite database
    const db = inputs.connection

    try {
      // Build column names and values arrays
      const columnNames = Object.keys(s3q.newRecord)
      const columnValues = Object.values(s3q.newRecord)

      // Validate that we have data to insert
      if (columnNames.length === 0) {
        throw new Error('Cannot create record: no data provided')
      }

      // Prepare the INSERT statement with proper SQL escaping
      const columns = columnNames.map((col) => `\`${col}\``).join(', ')
      const placeholders = columnNames.map(() => '?').join(', ')
      const sql = `INSERT INTO \`${tableName}\` (${columns}) VALUES (${placeholders})`

      // Use prepared statement (optimized for repeated use)
      const stmt = db.getPreparedStatement
        ? db.getPreparedStatement(sql)
        : db.prepare(sql)

      // Execute the INSERT statement within a transaction for consistency
      const info = db.runInTransaction
        ? db.runInTransaction(() => stmt.run(columnValues))
        : stmt.run(columnValues)

      // If `fetch` is NOT enabled, we're done.
      if (!isFetchEnabled) {
        return exits.success()
      }

      // Otherwise, fetch the newly created record
      const selectSql = `SELECT * FROM \`${tableName}\` WHERE rowid = ?`
      const selectStmt = db.prepare(selectSql)
      const phRecord = selectStmt.get(info.lastInsertRowid)

      if (!phRecord) {
        return exits.error(
          new Error(
            'Consistency violation: Unable to retrieve the inserted record. This might indicate a consistency violation.'
          )
        )
      }

      try {
        // Process record (mutate in-place) to wash away adapter-specific eccentricities.
        processNativeRecord(phRecord, WLModel, s3q.meta)
      } catch (e) {
        return exits.error(e)
      }

      // Send back the record
      return exits.success(phRecord)
    } catch (err) {
      err = processNativeError(err)
      if (err.footprint && err.footprint.identity === 'notUnique') {
        return exits.notUnique(err)
      }
      return exits.error(err)
    }
  }
}

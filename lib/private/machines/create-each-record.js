const util = require('util')
const processNativeRecord = require('./private/process-native-record')
const processNativeError = require('./private/process-native-error')
const reifyValuesToSet = require('./private/reify-values-to-set')

module.exports = {
  friendlyName: 'Create each (record)',

  description: 'Insert multiple records into a table in the SQLite database.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Records (maybe)',
      outputDescription:
        'Either `null` or (if `fetch:true`) an array of new physical records that were created.',
      outputExample: '==='
    },
    notUnique: require('../constants/not-unique.exit')
  },

  fn: async function (inputs, exits) {
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSQLiteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (CREATE EACH RECORD):',
        util.inspect(s3q, { depth: 5 }),
        '\n'
      )
    }

    const tableName = s3q.using
    // Find model by tableName since models is an object, not an array
    let WLModel = null
    for (const modelIdentity in inputs.dryOrm.models) {
      if (inputs.dryOrm.models[modelIdentity].tableName === tableName) {
        WLModel = inputs.dryOrm.models[modelIdentity]
        break
      }
    }

    if (!WLModel) {
      return exits.error(
        new Error(
          `No model with that tableName (\`${tableName}\`) has been registered with this adapter. Were any unexpected modifications made to the stage 3 query? Could the adapter's internal state have been corrupted? (This error is usually due to a bug in this adapter's implementation.)`
        )
      )
    }

    try {
      s3q.newRecords.forEach((newRecord) => {
        reifyValuesToSet(newRecord, WLModel, s3q.meta)
      })
    } catch (e) {
      return exits.error(e)
    }

    const isFetchEnabled = !!(s3q.meta && s3q.meta.fetch)

    const db = inputs.connection

    // Validate records array
    if (!Array.isArray(s3q.newRecords) || s3q.newRecords.length === 0) {
      return exits.error(
        new Error(
          'Cannot create records: no data provided or invalid data format'
        )
      )
    }

    try {
      // Performance optimization: Use a single INSERT statement with multiple VALUES
      // This is much more efficient than individual INSERT statements
      const firstRecord = s3q.newRecords[0]
      const columnNames = Object.keys(firstRecord)

      // Validate that all records have the same columns
      const invalidRecord = s3q.newRecords.find((record) => {
        const recordColumns = Object.keys(record)
        return (
          recordColumns.length !== columnNames.length ||
          !recordColumns.every((col) => columnNames.includes(col))
        )
      })

      if (invalidRecord) {
        throw new Error(
          'All records must have the same columns for batch insert'
        )
      }

      const columns = columnNames.map((col) => `\`${col}\``).join(', ')
      const valueClause = `(${columnNames.map(() => '?').join(', ')})`
      const allValueClauses = Array(s3q.newRecords.length)
        .fill(valueClause)
        .join(', ')
      const sql = `INSERT INTO \`${tableName}\` (${columns}) VALUES ${allValueClauses}`

      // Flatten all values for the batch insert
      const allValues = s3q.newRecords.flatMap((record) =>
        columnNames.map((col) => record[col])
      )

      // Use transaction for atomic batch insert - recommended for performance
      let insertInfo
      if (db.runInTransaction) {
        insertInfo = db.runInTransaction(() => {
          const stmt = db.getPreparedStatement
            ? db.getPreparedStatement(sql)
            : db.prepare(sql)
          return stmt.run(allValues)
        })
      } else {
        // Fallback transaction approach
        const transaction = db.transaction(() => {
          const stmt = db.prepare(sql)
          return stmt.run(allValues)
        })
        insertInfo = transaction()
      }

      // If `fetch` is NOT enabled, we're done.
      if (!isFetchEnabled) {
        return exits.success()
      }

      // For batch inserts, we need to calculate the range of inserted IDs
      // SQLite auto-increments IDs sequentially in a transaction
      const lastInsertRowid = insertInfo.lastInsertRowid
      const recordCount = s3q.newRecords.length
      const firstInsertRowid = lastInsertRowid - recordCount + 1

      // Fetch the inserted records using the ID range
      const selectSql = `SELECT * FROM \`${tableName}\` WHERE rowid >= ? AND rowid <= ? ORDER BY rowid`
      const selectStmt = db.prepare(selectSql)
      const phRecords = selectStmt.all(firstInsertRowid, lastInsertRowid)

      if (phRecords.length !== recordCount) {
        throw new Error(
          `Consistency violation: Expected ${recordCount} records but retrieved ${phRecords.length}`
        )
      }

      // Process records in place for better performance
      phRecords.forEach((phRecord) => {
        processNativeRecord(phRecord, WLModel, s3q.meta)
      })

      return exits.success(phRecords)
    } catch (err) {
      err = processNativeError(err)
      if (err.footprint && err.footprint.identity === 'notUnique') {
        return exits.notUnique(err)
      }
      return exits.error(err)
    }
  }
}

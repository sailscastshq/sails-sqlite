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
    const WLModel = inputs.dryOrm.models.find(
      (model) => model.tableName === tableName
    )

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

    try {
      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      const insertedIds = []
      for (const record of s3q.newRecords) {
        const columns = Object.keys(record).join(', ')
        const placeholders = Object.keys(record)
          .map(() => '?')
          .join(', ')
        const sql = `INSERT INTO ${tableName} (${columns}) VALUES (${placeholders})`

        const stmt = db.prepare(sql)
        const info = stmt.run(Object.values(record))
        insertedIds.push(info.lastInsertRowid)
      }

      // Commit the transaction
      db.exec('COMMIT')

      // If `fetch` is NOT enabled, we're done.
      if (!isFetchEnabled) {
        return exits.success()
      }

      // Fetch the inserted records
      const placeholders = insertedIds.map(() => '?').join(', ')
      const selectSql = `SELECT * FROM ${tableName} WHERE rowid IN (${placeholders})`
      const selectStmt = db.prepare(selectSql)
      const phRecords = selectStmt.all(insertedIds)

      phRecords.forEach((phRecord) => {
        processNativeRecord(phRecord, WLModel, s3q.meta)
      })

      return exits.success(phRecords)
    } catch (err) {
      // Rollback the transaction in case of error
      db.exec('ROLLBACK')

      err = processNativeError(err)
      if (err.footprint && err.footprint.identity === 'notUnique') {
        return exits.notUnique(err)
      }
      return exits.error(err)
    }
  }
}

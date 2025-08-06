const util = require('util')
const processNativeRecord = require('./private/process-native-record')
const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Destroy (records)',

  description:
    'Destroy record(s) in the SQLite database matching a query criteria.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Records (maybe)',
      outputDescription:
        'Either `null` OR (if `fetch:true`) an array of physical records that were destroyed.',
      outputExample: '==='
    }
  },

  fn: async function (inputs, exits) {
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSqliteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (DESTROY RECORDS):',
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

    const pkColumnName = WLModel.attributes[WLModel.primaryKey].columnName
    const isFetchEnabled = !!(s3q.meta && s3q.meta.fetch)

    const sqliteWhere = buildSqliteWhereClause(
      s3q.criteria.where,
      WLModel,
      s3q.meta
    )

    const db = inputs.connection

    try {
      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      let phRecords
      if (isFetchEnabled) {
        // Fetch matching records before deletion
        const selectSql = `SELECT * FROM ${tableName} WHERE ${sqliteWhere}`
        const selectStmt = db.prepare(selectSql)
        phRecords = selectStmt.all()
      }

      // Perform the deletion
      const deleteSql = `DELETE FROM ${tableName} WHERE ${sqliteWhere}`
      const deleteStmt = db.prepare(deleteSql)
      const deleteInfo = deleteStmt.run()

      // Commit the transaction
      db.exec('COMMIT')

      if (!isFetchEnabled) {
        return exits.success()
      }

      // Process fetched records
      phRecords.forEach((phRecord) => {
        processNativeRecord(phRecord, WLModel, s3q.meta)
      })

      return exits.success(phRecords)
    } catch (err) {
      // Rollback the transaction in case of error
      db.exec('ROLLBACK')
      return exits.error(err)
    }
  }
}

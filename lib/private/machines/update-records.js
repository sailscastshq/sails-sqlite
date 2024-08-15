const util = require('util')
const processNativeRecord = require('./private/process-native-record')
const processNativeError = require('./private/process-native-error')
const reifyValuesToSet = require('./private/reify-values-to-set')
const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Update (records)',

  description:
    'Update record(s) in the SQLite database based on a query criteria.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Records (maybe)',
      outputDescription:
        'Either `null` OR (if `fetch:true`) an array of physical records that were updated.',
      outputExample: '==='
    },
    notUnique: require('../constants/not-unique.exit')
  },

  fn: async function (inputs, exits) {
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSqliteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (UPDATE RECORDS):',
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

    const pkColumnName = WLModel.attributes[WLModel.primaryKey].columnName

    const isFetchEnabled = !!(s3q.meta && s3q.meta.fetch)

    try {
      reifyValuesToSet(s3q.valuesToSet, WLModel, s3q.meta)
    } catch (e) {
      return exits.error(e)
    }

    const sqliteWhere = buildSqliteWhereClause(
      s3q.criteria.where,
      WLModel,
      s3q.meta
    )

    const db = inputs.connection

    try {
      // Start a transaction
      db.exec('BEGIN TRANSACTION')

      let affectedIds = []

      if (isFetchEnabled) {
        // Get the IDs of records which match this criteria
        const selectSql = `SELECT ${pkColumnName} FROM ${tableName} WHERE ${sqliteWhere}`
        const selectStmt = db.prepare(selectSql)
        affectedIds = selectStmt.all().map((row) => row[pkColumnName])
      }

      // Prepare the UPDATE statement
      const setClauses = Object.entries(s3q.valuesToSet)
        .map(([column, value]) => `${column} = ?`)
        .join(', ')
      const updateSql = `UPDATE ${tableName} SET ${setClauses} WHERE ${sqliteWhere}`
      const updateStmt = db.prepare(updateSql)

      // Execute the UPDATE
      const updateInfo = updateStmt.run(...Object.values(s3q.valuesToSet))

      // Handle case where pk value was changed
      if (
        s3q.valuesToSet[pkColumnName] !== undefined &&
        affectedIds.length === 1
      ) {
        const oldPkValue = affectedIds[0]
        const newPkValue = s3q.valuesToSet[pkColumnName]
        affectedIds = [newPkValue]
      } else if (
        s3q.valuesToSet[pkColumnName] !== undefined &&
        affectedIds.length > 1
      ) {
        db.exec('ROLLBACK')
        return exits.error(
          new Error(
            'Consistency violation: Updated multiple records to have the same primary key value. (PK values should be unique!)'
          )
        )
      }

      // If fetch is not enabled, we're done
      if (!isFetchEnabled) {
        db.exec('COMMIT')
        return exits.success()
      }

      // Fetch the updated records
      const fetchSql = `SELECT * FROM ${tableName} WHERE ${pkColumnName} IN (${affectedIds.map(() => '?').join(', ')})`
      const fetchStmt = db.prepare(fetchSql)
      const phRecords = fetchStmt.all(affectedIds)

      // Process records
      phRecords.forEach((phRecord) => {
        processNativeRecord(phRecord, WLModel, s3q.meta)
      })

      db.exec('COMMIT')
      return exits.success(phRecords)
    } catch (err) {
      db.exec('ROLLBACK')
      err = processNativeError(err)
      if (err.footprint && err.footprint.identity === 'notUnique') {
        return exits.notUnique(err)
      }
      return exits.error(err)
    }
  }
}

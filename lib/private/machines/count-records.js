const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Count (records)',

  description: 'Return the count of the records matched by the query.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Total (# of records)',
      outputDescription: 'The number of matching records.',
      outputExample: 59
    }
  },

  fn: function (inputs, exits) {
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSqliteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (COUNT RECORDS):',
        require('util').inspect(s3q, { depth: 5 }),
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

    // Build a SQLite WHERE clause from the `where` clause.
    let whereClause
    try {
      whereClause = buildSqliteWhereClause(
        s3q.criteria.where,
        WLModel,
        s3q.meta
      )
    } catch (e) {
      return exits.error(e)
    }

    const db = inputs.connection

    try {
      let countQuery = `SELECT COUNT(*) as count FROM ${tableName}`
      if (whereClause) {
        countQuery += ` WHERE ${whereClause}`
      }

      const stmt = db.prepare(countQuery)
      const result = stmt.get()

      return exits.success(result.count)
    } catch (err) {
      return exits.error(err)
    }
  }
}

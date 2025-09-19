const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Sum (records)',

  description:
    'Return the cumulative sum (∑) of a particular property over matching records.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Total (sum)',
      outputDescription:
        'The sum of the given property across all matching records.',
      outputExample: 999.99
    }
  },

  fn: function sum(inputs, exits) {
    const s3q = inputs.query

    const tableName = s3q.using
    const numericFieldName = s3q.numericAttrName

    // Grab the model definition
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
      let sumQuery = `SELECT COALESCE(SUM(\`${numericFieldName}\`), 0) as total FROM \`${tableName}\``
      if (whereClause) {
        sumQuery += ` WHERE ${whereClause}`
      }

      const stmt = db.prepare(sumQuery)
      const result = stmt.get()

      return exits.success(result.total)
    } catch (err) {
      return exits.error(err)
    }
  }
}

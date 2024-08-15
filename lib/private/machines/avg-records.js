const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Avg (records)',

  description: 'Return the Average of the records matched by the query.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Average (mean)',
      outputDescription:
        'The average value of the given property across all records.',
      outputExample: -48.1293
    }
  },

  fn: function (inputs, exits) {
    const s3q = inputs.query

    const tableName = s3q.using
    const numericFieldName = s3q.numericAttrName

    // Grab the model definition
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
      let avgQuery = `SELECT COALESCE(AVG(${numericFieldName}), 0) as average FROM ${tableName}`
      if (whereClause) {
        avgQuery += ` WHERE ${whereClause}`
      }

      const stmt = db.prepare(avgQuery)
      const result = stmt.get()

      return exits.success(result.average)
    } catch (err) {
      return exits.error(err)
    }
  }
}

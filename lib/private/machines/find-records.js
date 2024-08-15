const assert = require('assert')
const util = require('util')
const processNativeRecord = require('./private/process-native-record')
const buildSqliteWhereClause = require('./private/build-sqlite-where-clause')

module.exports = {
  friendlyName: 'Find (records)',

  description: 'Find record(s) in the SQLite database.',

  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
  },

  exits: {
    success: {
      outputFriendlyName: 'Records',
      outputDescription: 'An array of physical records.',
      outputExample: '===' //[ {===} ]
    }
  },

  fn: async function (inputs, exits) {
    const s3q = inputs.query
    if (s3q.meta && s3q.meta.logSqliteS3Qs) {
      console.log(
        '* * * * * *\nADAPTER (FIND RECORDS):',
        util.inspect(s3q, { depth: 10 }),
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

    const db = inputs.connection

    try {
      let sqlQuery = `SELECT `

      // Handle SELECT clause
      if (s3q.criteria.select) {
        sqlQuery += s3q.criteria.select.join(', ')
      } else {
        sqlQuery += '*'
      }

      sqlQuery += ` FROM ${tableName}`

      // Handle WHERE clause
      const whereClause = buildSqliteWhereClause(
        s3q.criteria.where,
        WLModel,
        s3q.meta
      )
      if (whereClause) {
        sqlQuery += ` WHERE ${whereClause}`
      }

      // Handle SORT clause
      if (s3q.criteria.sort && s3q.criteria.sort.length) {
        const sortClauses = s3q.criteria.sort.map((sortObj) => {
          const key = Object.keys(sortObj)[0]
          const direction = sortObj[key] === 'ASC' ? 'ASC' : 'DESC'
          return `${key} ${direction}`
        })
        sqlQuery += ` ORDER BY ${sortClauses.join(', ')}`
      }

      // Handle LIMIT clause
      assert(
        Number.isFinite(s3q.criteria.limit),
        'At this point, the limit should always be a number. If you are seeing this message, there is probably a bug somewhere in your version of Waterline core.'
      )
      sqlQuery += ` LIMIT ${s3q.criteria.limit}`

      // Handle SKIP (OFFSET) clause
      if (s3q.criteria.skip) {
        sqlQuery += ` OFFSET ${s3q.criteria.skip}`
      }

      const stmt = db.prepare(sqlQuery)
      const nativeResult = stmt.all()

      // Process records
      const phRecords = nativeResult.map((record) => {
        processNativeRecord(record, WLModel, s3q.meta)
        return record
      })

      return exits.success(phRecords)
    } catch (err) {
      return exits.error(err)
    }
  }
}

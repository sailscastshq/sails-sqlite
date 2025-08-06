const processEachRecord = require('./private/process-each-record')
const generateJoinSqlQuery = require('./private/generate-join-sql-query')

module.exports = {
  friendlyName: 'Join',

  description: 'Perform a join operation in SQLite using better-sqlite3.',

  inputs: {
    datastore: {
      description: 'The datastore to use for the query.',
      required: true,
      example: '==='
    },
    models: {
      description:
        'An object containing all of the model definitions that have been registered.',
      required: true,
      example: '==='
    },
    query: {
      description: 'A normalized Waterline Stage Three Query.',
      required: true,
      example: '==='
    }
  },

  exits: {
    success: {
      description: 'The query was run successfully.',
      outputType: 'ref'
    },
    error: {
      description: 'An error occurred while performing the query.'
    }
  },

  fn: async function (inputs, exits) {
    const { datastore, models, query } = inputs

    try {
      const { joins } = require('waterline-utils')

      // Convert join criteria using waterline-utils
      const joinCriteria = joins.convertJoinCriteria({
        query,
        getPk: (tableName) => {
          // Find the model by tableName
          let targetModel = null
          for (const modelIdentity in models) {
            if (models[modelIdentity].tableName === tableName) {
              targetModel = models[modelIdentity]
              break
            }
          }

          if (!targetModel) {
            throw new Error(`No model found with tableName: ${tableName}`)
          }

          const pkAttrName = targetModel.primaryKey
          const pkDef = targetModel.attributes[pkAttrName]
          return pkDef.columnName || pkAttrName
        }
      })

      // Generate SQL query using our helper
      const { sql, bindings } = generateJoinSqlQuery(
        joinCriteria,
        models,
        query
      )

      // Execute the query using the database connection from the datastore
      const db = datastore.manager
      const stmt = db.prepare(sql)
      const results = stmt.all(...bindings)

      // Process results through the join utility
      const processedResults = joins.processJoinResults({
        query,
        records: results,
        orm: {
          collections: models
        }
      })

      return exits.success(processedResults)
    } catch (error) {
      return exits.error(error)
    }
  }
}

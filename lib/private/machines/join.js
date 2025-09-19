module.exports = {
  friendlyName: 'Join',
  description: 'Perform a join operation in SQLite using better-sqlite3.',
  inputs: {
    query: require('../constants/query.input'),
    connection: require('../constants/connection.input'),
    dryOrm: require('../constants/dry-orm.input')
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
  fn: function (inputs, exits) {
    const _ = require('@sailshq/lodash')
    const async = require('async')
    const WLUtils = require('waterline-utils')
    const processEachRecord = require('./private/process-each-record')
    const compileStatement = require('./private/compile-statement')

    const { query, connection, dryOrm } = inputs
    const models = dryOrm.models

    let hasReturned = false

    // Find the model definition
    const model = models[query.using]
    if (!model) {
      if (hasReturned) return
      hasReturned = true
      return exits.error(new Error(`No model found for table: ${query.using}`))
    }

    // Get primary key info
    const primaryKeyAttr = model.primaryKey
    const primaryKeyColumnName =
      model.definition[primaryKeyAttr].columnName || primaryKeyAttr

    // Build statements
    const statements = WLUtils.joins.convertJoinCriteria({
      query,
      getPk: function getPk(tableName) {
        let targetModel = null
        for (const modelIdentity in models) {
          if (models[modelIdentity].tableName === tableName) {
            targetModel = models[modelIdentity]
            break
          }
        }
        if (!targetModel) {
          throw new Error('Invalid parent table name')
        }
        const pkAttrName = targetModel.primaryKey
        const pkColumnName =
          targetModel.definition[pkAttrName].columnName || pkAttrName
        return pkColumnName
      }
    })

    // Run parent query
    const compiledQuery = compileStatement(statements.parentStatement)
    const db = connection
    const stmt = db.prepare(compiledQuery.sql)
    const parentResults = stmt.all(...(compiledQuery.bindings || []))

    // Early exit if no joins or no results
    if (!_.has(query, 'joins') || !parentResults.length) {
      if (hasReturned) return
      hasReturned = true
      return exits.success(parentResults)
    }

    // Detect child records
    const sortedResults = WLUtils.joins.detectChildrenRecords(
      primaryKeyColumnName,
      parentResults
    )

    // Initialize query cache
    const queryCache = WLUtils.joins.queryCache()

    // Process instructions
    _.each(statements.instructions, function (val, key) {
      const popInstructions = val.instructions
      const strategy = val.strategy.strategy
      const parentModel = models[_.first(popInstructions).parent]

      if (!parentModel) {
        throw new Error('Invalid parent model in instructions')
      }

      const pkAttr = parentModel.primaryKey
      const pkColumnName = parentModel.definition[pkAttr].columnName || pkAttr

      let alias, keyName
      if (val.strategy && val.strategy.strategy === 1) {
        alias = _.first(popInstructions).alias
        keyName = _.first(popInstructions).parentKey
      } else {
        alias = _.first(popInstructions).alias
      }

      _.each(sortedResults.parents, function (parentRecord) {
        const cache = {
          attrName: key,
          parentPkAttr: pkColumnName,
          belongsToPkValue: parentRecord[pkColumnName],
          keyName: keyName || alias,
          type: strategy
        }

        const childKey = _.first(popInstructions).childKey
        const parentKey = _.first(popInstructions).parentKey

        const records = _.filter(
          sortedResults.children[alias],
          function (child) {
            if (strategy === 3) {
              return child._parent_fk === parentRecord[parentKey]
            }
            return child[childKey] === parentRecord[parentKey]
          }
        )

        if (strategy === 3) {
          _.each(records, function (record) {
            delete record._parent_fk
          })
        }

        if (records.length) {
          cache.records = records
        }

        queryCache.set(cache)
      })
    })

    // Set parents
    queryCache.setParents(sortedResults.parents)

    // Single-query path (no child statements)
    if (!statements.childStatements || !statements.childStatements.length) {
      const combinedResults = queryCache.combineRecords() || []
      const orm = { collections: models }
      processEachRecord({
        records: combinedResults,
        identity: model.identity,
        orm: orm
      })
      if (hasReturned) return
      hasReturned = true
      return exits.success(combinedResults)
    }

    // Multi-query path (process child statements)
    const parentKeys = _.map(queryCache.getParents(), function (record) {
      return record[primaryKeyColumnName]
    })

    async.each(
      statements.childStatements,
      function (template, next) {
        // Handle IN queries
        if (template.queryType === 'in') {
          const inClause = _.pullAt(
            template.statement.where.and,
            template.statement.where.and.length - 1
          )
          const clause = _.first(inClause)
          _.each(clause, function (val) {
            val.in = parentKeys
          })
          template.statement.where.and.push(clause)
        }

        // Handle UNION queries with special case for per-entity pagination
        if (template.queryType === 'union') {
          const unionStatements = []
          _.each(parentKeys, function (parentPk) {
            const unionStatement = _.merge({}, template.statement)
            const andClause = _.pullAt(
              unionStatement.where.and,
              unionStatement.where.and.length - 1
            )
            _.each(_.first(andClause), function (val, key) {
              _.first(andClause)[key] = parentPk
            })
            unionStatement.where.and.push(_.first(andClause))
            unionStatements.push(unionStatement)
          })

          if (unionStatements.length) {
            // Check if this is per-entity pagination (has LIMIT/OFFSET)
            const hasPerEntityPagination =
              unionStatements[0].limit || unionStatements[0].skip

            if (hasPerEntityPagination && unionStatements.length > 1) {
              // SQLite-savvy approach: Execute separate queries for per-entity pagination
              const allChildResults = []

              _.each(unionStatements, function (singleStatement) {
                const compiledQuery = compileStatement(singleStatement)
                const stmt = db.prepare(compiledQuery.sql)
                const results = stmt.all(...(compiledQuery.bindings || []))
                allChildResults.push(...results)
              })

              // Extend cache with combined results
              queryCache.extend(allChildResults, template.instructions)
              return next()
            } else {
              // Standard UNION approach for non-pagination cases
              template.statement = { unionAll: unionStatements }
            }
          }
        }

        if (!template.statement) {
          return next()
        }

        // Run child query
        const childCompiledQuery = compileStatement(template.statement)
        const childStmt = db.prepare(childCompiledQuery.sql)
        const childResults = childStmt.all(
          ...(childCompiledQuery.bindings || [])
        )

        // Extend cache
        queryCache.extend(childResults, template.instructions)
        next()
      },
      function (err) {
        if (hasReturned) return

        if (err) {
          hasReturned = true
          return exits.error(err)
        }

        // Final combine and return
        const combinedResults = queryCache.combineRecords() || []
        const orm = { collections: models }
        processEachRecord({
          records: combinedResults,
          identity: model.identity,
          orm: orm
        })
        hasReturned = true
        return exits.success(combinedResults)
      }
    )
  }
}

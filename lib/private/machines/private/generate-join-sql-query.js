/**
 * Generate SQL query for join operations in SQLite
 * This follows SQLite performance best practices for optimal query performance
 */

module.exports = function generateJoinSqlQuery(joinCriteria, models, query) {
  const _ = require('@sailshq/lodash')

  try {
    // Start building the SELECT clause
    let sqlParts = {
      select: [],
      from: '',
      joins: [],
      where: [],
      orderBy: [],
      limit: '',
      bindings: []
    }

    // Get the primary table info
    const primaryTableName = query.using
    const primaryModel = _.find(models, { tableName: primaryTableName })

    if (!primaryModel) {
      throw new Error(`Primary model not found for table: ${primaryTableName}`)
    }

    // Build SELECT clause - use explicit column names for better performance
    if (query.criteria && query.criteria.select) {
      sqlParts.select = query.criteria.select.map(
        (col) => `${primaryTableName}.${col}`
      )
    } else {
      // Select all columns from primary table with table prefix
      const primaryCols = Object.keys(primaryModel.attributes).map((attr) => {
        const colName = primaryModel.attributes[attr].columnName || attr
        return `${primaryTableName}.${colName}`
      })
      sqlParts.select = primaryCols
    }

    // Add joined table columns
    if (joinCriteria && joinCriteria.joins) {
      joinCriteria.joins.forEach((join) => {
        const joinModel = _.find(models, { tableName: join.child })
        if (joinModel) {
          const joinCols = Object.keys(joinModel.attributes).map((attr) => {
            const colName = joinModel.attributes[attr].columnName || attr
            return `${join.child}.${colName} as ${join.child}_${colName}`
          })
          sqlParts.select = sqlParts.select.concat(joinCols)
        }
      })
    }

    // FROM clause
    sqlParts.from = primaryTableName

    // JOIN clauses
    if (joinCriteria && joinCriteria.joins) {
      joinCriteria.joins.forEach((join) => {
        let joinType = 'INNER JOIN' // Default to inner join

        // Determine join type based on Waterline criteria
        if (join.criteria && join.criteria.where) {
          // This is a simplified check - you might need more sophisticated logic
          joinType = 'LEFT JOIN'
        }

        // Build the JOIN clause with proper foreign key relationships
        const joinClause = `${joinType} ${join.child} ON ${primaryTableName}.${join.parentKey} = ${join.child}.${join.childKey}`
        sqlParts.joins.push(joinClause)
      })
    }

    // WHERE clause - handle both primary and join criteria
    const whereConditions = []

    if (query.criteria && query.criteria.where) {
      const primaryWhere = buildWhereClause(
        query.criteria.where,
        primaryTableName,
        primaryModel
      )
      if (primaryWhere.clause) {
        whereConditions.push(primaryWhere.clause)
        sqlParts.bindings = sqlParts.bindings.concat(primaryWhere.bindings)
      }
    }

    // Add join-specific where conditions
    if (joinCriteria && joinCriteria.joins) {
      joinCriteria.joins.forEach((join) => {
        if (join.criteria && join.criteria.where) {
          const joinModel = _.find(models, { tableName: join.child })
          if (joinModel) {
            const joinWhere = buildWhereClause(
              join.criteria.where,
              join.child,
              joinModel
            )
            if (joinWhere.clause) {
              whereConditions.push(joinWhere.clause)
              sqlParts.bindings = sqlParts.bindings.concat(joinWhere.bindings)
            }
          }
        }
      })
    }

    sqlParts.where = whereConditions

    // ORDER BY clause
    if (query.criteria && query.criteria.sort) {
      sqlParts.orderBy = query.criteria.sort.map((sortObj) => {
        const key = Object.keys(sortObj)[0]
        const direction = sortObj[key].toUpperCase()
        return `${primaryTableName}.${key} ${direction}`
      })
    }

    // LIMIT clause
    if (query.criteria && typeof query.criteria.limit === 'number') {
      sqlParts.limit = `LIMIT ${query.criteria.limit}`

      if (typeof query.criteria.skip === 'number') {
        sqlParts.limit += ` OFFSET ${query.criteria.skip}`
      }
    }

    // Assemble the final SQL query
    let sql = `SELECT ${sqlParts.select.join(', ')} FROM ${sqlParts.from}`

    if (sqlParts.joins.length > 0) {
      sql += ' ' + sqlParts.joins.join(' ')
    }

    if (sqlParts.where.length > 0) {
      sql += ' WHERE ' + sqlParts.where.join(' AND ')
    }

    if (sqlParts.orderBy.length > 0) {
      sql += ' ORDER BY ' + sqlParts.orderBy.join(', ')
    }

    if (sqlParts.limit) {
      sql += ' ' + sqlParts.limit
    }

    return {
      sql: sql,
      bindings: sqlParts.bindings
    }
  } catch (error) {
    throw new Error(`Error generating join SQL query: ${error.message}`)
  }
}

/**
 * Build WHERE clause for a given criteria object
 * This handles parameterized queries for SQL injection protection
 */
function buildWhereClause(whereObj, tableName, model) {
  const conditions = []
  const bindings = []

  if (!whereObj || typeof whereObj !== 'object') {
    return { clause: '', bindings: [] }
  }

  for (const [key, value] of Object.entries(whereObj)) {
    if (key === 'and') {
      // Handle AND conditions
      if (Array.isArray(value)) {
        const andConditions = []
        value.forEach((condition) => {
          const subWhere = buildWhereClause(condition, tableName, model)
          if (subWhere.clause) {
            andConditions.push(subWhere.clause)
            bindings.push(...subWhere.bindings)
          }
        })
        if (andConditions.length > 0) {
          conditions.push(`(${andConditions.join(' AND ')})`)
        }
      }
    } else if (key === 'or') {
      // Handle OR conditions
      if (Array.isArray(value)) {
        const orConditions = []
        value.forEach((condition) => {
          const subWhere = buildWhereClause(condition, tableName, model)
          if (subWhere.clause) {
            orConditions.push(subWhere.clause)
            bindings.push(...subWhere.bindings)
          }
        })
        if (orConditions.length > 0) {
          conditions.push(`(${orConditions.join(' OR ')})`)
        }
      }
    } else {
      // Handle regular field conditions
      const columnName = model.attributes[key]
        ? model.attributes[key].columnName || key
        : key
      const fullColumnName = `${tableName}.${columnName}`

      if (typeof value === 'object' && value !== null) {
        // Handle operators like >, <, !=, in, etc.
        for (const [operator, operatorValue] of Object.entries(value)) {
          switch (operator) {
            case '>':
              conditions.push(`${fullColumnName} > ?`)
              bindings.push(operatorValue)
              break
            case '<':
              conditions.push(`${fullColumnName} < ?`)
              bindings.push(operatorValue)
              break
            case '>=':
              conditions.push(`${fullColumnName} >= ?`)
              bindings.push(operatorValue)
              break
            case '<=':
              conditions.push(`${fullColumnName} <= ?`)
              bindings.push(operatorValue)
              break
            case '!=':
            case 'ne':
              conditions.push(`${fullColumnName} != ?`)
              bindings.push(operatorValue)
              break
            case 'in':
              if (Array.isArray(operatorValue) && operatorValue.length > 0) {
                const placeholders = operatorValue.map(() => '?').join(', ')
                conditions.push(`${fullColumnName} IN (${placeholders})`)
                bindings.push(...operatorValue)
              }
              break
            case 'nin':
              if (Array.isArray(operatorValue) && operatorValue.length > 0) {
                const placeholders = operatorValue.map(() => '?').join(', ')
                conditions.push(`${fullColumnName} NOT IN (${placeholders})`)
                bindings.push(...operatorValue)
              }
              break
            case 'like':
              conditions.push(`${fullColumnName} LIKE ?`)
              bindings.push(operatorValue)
              break
            case 'contains':
              conditions.push(`${fullColumnName} LIKE ?`)
              bindings.push(`%${operatorValue}%`)
              break
            case 'startsWith':
              conditions.push(`${fullColumnName} LIKE ?`)
              bindings.push(`${operatorValue}%`)
              break
            case 'endsWith':
              conditions.push(`${fullColumnName} LIKE ?`)
              bindings.push(`%${operatorValue}`)
              break
            default:
              // Default to equality
              conditions.push(`${fullColumnName} = ?`)
              bindings.push(operatorValue)
          }
        }
      } else {
        // Simple equality
        conditions.push(`${fullColumnName} = ?`)
        bindings.push(value)
      }
    }
  }

  return {
    clause: conditions.join(' AND '),
    bindings: bindings
  }
}

function generateSqlQuery(joinCriteria, models) {
  const { parentStatement, joins } = joinCriteria
  const tableName = parentStatement.from
  const model = models[tableName]

  let sql = `SELECT ${tableName}.*`
  const bindings = []

  // Add select clauses for joined tables
  joins.forEach((join, index) => {
    const joinModel = models[join.childCollectionIdentity]
    const joinAlias = `t${index + 1}`
    Object.keys(joinModel.definition).forEach((attr) => {
      if (joinModel.definition[attr].columnName) {
        sql += `, ${joinAlias}.${joinModel.definition[attr].columnName} AS ${joinAlias}_${attr}`
      }
    })
  })

  sql += ` FROM ${tableName}`

  // Add join clauses
  joins.forEach((join, index) => {
    const joinType = join.type === 'INNER JOIN' ? 'INNER JOIN' : 'LEFT JOIN'
    const joinAlias = `t${index + 1}`
    sql += ` ${joinType} ${join.childCollectionIdentity} AS ${joinAlias} ON `

    const joinConditions = []
    Object.keys(join.on).forEach((key) => {
      const parentField = model.definition[key].columnName || key
      const childField =
        models[join.childCollectionIdentity].definition[join.on[key]]
          .columnName || join.on[key]
      joinConditions.push(
        `${tableName}.${parentField} = ${joinAlias}.${childField}`
      )
    })
    sql += joinConditions.join(' AND ')
  })

  // Add where clause
  if (parentStatement.where && Object.keys(parentStatement.where).length > 0) {
    sql += ' WHERE '
    const whereClauses = []
    Object.entries(parentStatement.where).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        Object.entries(value).forEach(([operator, operand]) => {
          switch (operator) {
            case 'in':
              whereClauses.push(
                `${tableName}.${key} IN (${operand.map(() => '?').join(', ')})`
              )
              bindings.push(...operand)
              break
            case 'like':
              whereClauses.push(`${tableName}.${key} LIKE ?`)
              bindings.push(operand)
              break
            // Add more operators as needed
          }
        })
      } else {
        whereClauses.push(`${tableName}.${key} = ?`)
        bindings.push(value)
      }
    })
    sql += whereClauses.join(' AND ')
  }

  // Add order by clause
  if (parentStatement.sort && parentStatement.sort.length > 0) {
    sql +=
      ' ORDER BY ' +
      parentStatement.sort
        .map((sortClause) => {
          const direction = sortClause.dir === 'desc' ? 'DESC' : 'ASC'
          return `${tableName}.${sortClause.attrName} ${direction}`
        })
        .join(', ')
  }

  // Add limit and skip
  if (parentStatement.limit) {
    sql += ' LIMIT ?'
    bindings.push(parentStatement.limit)
  }
  if (parentStatement.skip) {
    sql += ' OFFSET ?'
    bindings.push(parentStatement.skip)
  }

  return { sql, bindings }
}

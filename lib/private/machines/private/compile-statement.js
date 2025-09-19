/**
 * Compile a Waterline statement into a native SQLite query
 */

const buildSqliteWhereClause = require('./build-sqlite-where-clause')

module.exports = function compileStatement(statement) {
  if (!statement) {
    throw new Error('Statement is required')
  }

  let sql = ''
  let bindings = []

  // Handle UNION ALL queries
  if (statement.unionAll && Array.isArray(statement.unionAll)) {
    const unionQueries = []
    let globalOrderBy = null

    statement.unionAll.forEach((unionStatement) => {
      let processedStatement = { ...unionStatement }

      // Remove ORDER BY, LIMIT, SKIP from individual queries - apply globally
      if (!globalOrderBy && unionStatement.orderBy) {
        globalOrderBy = unionStatement.orderBy
      }
      delete processedStatement.orderBy
      delete processedStatement.limit
      delete processedStatement.skip

      const compiledUnion = compileStatement(processedStatement)
      unionQueries.push(compiledUnion.sql)
      bindings = bindings.concat(compiledUnion.bindings || [])
    })

    sql = unionQueries.join(' UNION ALL ')

    // Apply global ORDER BY if present
    if (
      globalOrderBy &&
      Array.isArray(globalOrderBy) &&
      globalOrderBy.length > 0
    ) {
      const orderClauses = globalOrderBy.map((orderItem) => {
        if (typeof orderItem === 'string') {
          return `\`${orderItem}\` ASC`
        }
        if (typeof orderItem === 'object') {
          const key = Object.keys(orderItem)[0]
          const direction =
            orderItem[key].toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
          return `\`${key}\` ${direction}`
        }
        return orderItem
      })
      sql += ` ORDER BY ${orderClauses.join(', ')}`
    }

    return { sql, bindings }
  }

  // Handle regular SELECT statements
  if (statement.select) {
    // SELECT clause
    if (Array.isArray(statement.select) && statement.select.length > 0) {
      const selectColumns = statement.select.map((col) => {
        // Handle columns with aliases (e.g., 'table.column as alias')
        if (col.includes(' as ')) {
          const [columnPart, aliasPart] = col.split(' as ')
          const alias = aliasPart.trim()

          // Process the column part
          let formattedColumn
          if (columnPart.includes('.')) {
            const parts = columnPart.split('.')
            if (parts.length === 2) {
              const [tableName, columnName] = parts
              formattedColumn = `\`${tableName}\`.\`${columnName}\``
            } else {
              formattedColumn = columnPart
            }
          } else {
            formattedColumn = `\`${columnPart}\``
          }

          return `${formattedColumn} AS ${alias}`
        }
        // Handle table-prefixed columns (e.g., 'tableName.columnName')
        else if (col.includes('.')) {
          const parts = col.split('.')
          if (parts.length === 2) {
            const [tableName, columnName] = parts
            return `\`${tableName}\`.\`${columnName}\``
          }
          // Handle complex column expressions
          return col
        } else {
          return `\`${col}\``
        }
      })
      sql += `SELECT ${selectColumns.join(', ')}`
    } else {
      sql += 'SELECT *'
    }

    // FROM clause
    if (statement.from) {
      // Handle table aliases (e.g., "paymentTable as paymentTable__payments")
      if (statement.from.includes(' as ')) {
        const [tableName, alias] = statement.from.split(' as ')
        sql += ` FROM \`${tableName.trim()}\` AS \`${alias.trim()}\``
      } else {
        sql += ` FROM \`${statement.from}\``
      }
    }

    // JOIN clauses
    if (statement.leftOuterJoin && Array.isArray(statement.leftOuterJoin)) {
      statement.leftOuterJoin.forEach((join) => {
        if (join.from && join.on) {
          // Handle table aliases in JOIN
          let joinTable
          if (join.from.includes(' as ')) {
            const [tableName, alias] = join.from.split(' as ')
            joinTable = `\`${tableName.trim()}\` AS \`${alias.trim()}\``
          } else {
            joinTable = `\`${join.from}\``
          }

          sql += ` LEFT OUTER JOIN ${joinTable} ON `

          // Build the ON conditions
          const onConditions = []
          Object.keys(join.on).forEach((tableName) => {
            const columnName = join.on[tableName]
            // The key is a table name, value is a column name
            // We need to format as table.column for both sides
            const formattedTableCol = `\`${tableName}\`.\`${columnName}\``
            onConditions.push(formattedTableCol)
          })

          // Join conditions should be joined with =
          // If we have 2 conditions, it should be table1.col1 = table2.col2
          if (onConditions.length === 2) {
            sql += `${onConditions[0]} = ${onConditions[1]}`
          } else {
            // Fallback for other cases
            sql += onConditions.join(' AND ')
          }
        }
      })
    }

    // WHERE clause
    if (statement.where) {
      const whereResult = buildWhereClause(statement.where)
      if (whereResult.clause) {
        sql += ` WHERE ${whereResult.clause}`
        bindings = bindings.concat(whereResult.bindings || [])
      }
    }

    // ORDER BY clause
    if (
      statement.orderBy &&
      Array.isArray(statement.orderBy) &&
      statement.orderBy.length > 0
    ) {
      const orderClauses = statement.orderBy.map((orderItem) => {
        if (typeof orderItem === 'string') {
          return `\`${orderItem}\` ASC`
        }
        if (typeof orderItem === 'object') {
          const key = Object.keys(orderItem)[0]
          const direction =
            orderItem[key].toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
          return `\`${key}\` ${direction}`
        }
        return orderItem
      })
      sql += ` ORDER BY ${orderClauses.join(', ')}`
    }

    // LIMIT clause
    if (typeof statement.limit === 'number') {
      sql += ` LIMIT ${statement.limit}`
    }

    // OFFSET clause
    if (typeof statement.skip === 'number') {
      sql += ` OFFSET ${statement.skip}`
    }
  }

  return { sql, bindings }
}

/**
 * Build WHERE clause from Waterline criteria
 */
function buildWhereClause(whereObj) {
  if (!whereObj || typeof whereObj !== 'object') {
    return { clause: '', bindings: [] }
  }

  const conditions = []
  const bindings = []

  // Handle AND conditions
  if (whereObj.and && Array.isArray(whereObj.and)) {
    const andConditions = []
    whereObj.and.forEach((condition) => {
      const result = buildWhereClause(condition)
      if (result.clause) {
        andConditions.push(result.clause)
        bindings.push(...result.bindings)
      }
    })
    if (andConditions.length > 0) {
      conditions.push(`(${andConditions.join(' AND ')})`)
    }
  }

  // Handle OR conditions
  if (whereObj.or && Array.isArray(whereObj.or)) {
    const orConditions = []
    whereObj.or.forEach((condition) => {
      const result = buildWhereClause(condition)
      if (result.clause) {
        orConditions.push(result.clause)
        bindings.push(...result.bindings)
      }
    })
    if (orConditions.length > 0) {
      conditions.push(`(${orConditions.join(' OR ')})`)
    }
  }

  // Handle field conditions
  Object.keys(whereObj).forEach((key) => {
    if (key === 'and' || key === 'or') {
      return // Already handled above
    }

    const value = whereObj[key]
    let columnName

    // Handle table.column format
    if (key.includes('.')) {
      const parts = key.split('.')
      if (parts.length === 2) {
        const [tableName, colName] = parts
        columnName = `\`${tableName}\`.\`${colName}\``
      } else {
        columnName = key // fallback for complex expressions
      }
    } else {
      columnName = `\`${key}\``
    }

    if (typeof value === 'object' && value !== null) {
      // Handle operators
      Object.keys(value).forEach((operator) => {
        const operatorValue = value[operator]

        switch (operator) {
          case 'in':
            if (Array.isArray(operatorValue) && operatorValue.length > 0) {
              const placeholders = operatorValue.map(() => '?').join(', ')
              conditions.push(`${columnName} IN (${placeholders})`)
              bindings.push(...operatorValue)
            }
            break
          case 'nin':
            if (Array.isArray(operatorValue) && operatorValue.length > 0) {
              const placeholders = operatorValue.map(() => '?').join(', ')
              conditions.push(`${columnName} NOT IN (${placeholders})`)
              bindings.push(...operatorValue)
            }
            break
          case '>':
            conditions.push(`${columnName} > ?`)
            bindings.push(operatorValue)
            break
          case '>=':
            conditions.push(`${columnName} >= ?`)
            bindings.push(operatorValue)
            break
          case '<':
            conditions.push(`${columnName} < ?`)
            bindings.push(operatorValue)
            break
          case '<=':
            conditions.push(`${columnName} <= ?`)
            bindings.push(operatorValue)
            break
          case '!=':
          case 'ne':
            conditions.push(`${columnName} != ?`)
            bindings.push(operatorValue)
            break
          case 'like':
            conditions.push(`${columnName} LIKE ?`)
            bindings.push(operatorValue)
            break
          case 'contains':
            conditions.push(`${columnName} LIKE ?`)
            bindings.push(`%${operatorValue}%`)
            break
          case 'startsWith':
            conditions.push(`${columnName} LIKE ?`)
            bindings.push(`${operatorValue}%`)
            break
          case 'endsWith':
            conditions.push(`${columnName} LIKE ?`)
            bindings.push(`%${operatorValue}`)
            break
          default:
            conditions.push(`${columnName} = ?`)
            bindings.push(operatorValue)
        }
      })
    } else {
      // Simple equality
      conditions.push(`${columnName} = ?`)
      bindings.push(value)
    }
  })

  return {
    clause: conditions.join(' AND '),
    bindings: bindings
  }
}

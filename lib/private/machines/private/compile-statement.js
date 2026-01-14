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
          if (orderItem.includes('.')) {
            const parts = orderItem.split('.')
            if (parts.length === 2) {
              const [tableName, columnName] = parts
              return `\`${tableName}\`.\`${columnName}\` ASC`
            }
          }
          return `\`${orderItem}\` ASC`
        }
        if (typeof orderItem === 'object') {
          const key = Object.keys(orderItem)[0]
          const direction =
            orderItem[key].toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
          if (key.includes('.')) {
            const parts = key.split('.')
            if (parts.length === 2) {
              const [tableName, columnName] = parts
              return `\`${tableName}\`.\`${columnName}\` ${direction}`
            }
          }
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
    const hasJoins =
      statement.leftOuterJoin && statement.leftOuterJoin.length > 0

    // Build a map of column names to their qualified table.column references
    // This helps resolve unqualified ORDER BY columns
    const columnToTable = {}
    if (Array.isArray(statement.select)) {
      statement.select.forEach((col) => {
        if (col.includes('.')) {
          const colWithoutAlias = col.includes(' as ')
            ? col.split(' as ')[0].trim()
            : col
          const parts = colWithoutAlias.split('.')
          if (parts.length === 2) {
            const [tableName, columnName] = parts
            columnToTable[columnName] = tableName
          }
        }
      })
    }

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
      const whereClause = buildSqliteWhereClause(statement.where)
      if (whereClause.clause) {
        sql += ` WHERE ${whereClause.clause}`
        bindings = bindings.concat(whereClause.bindings || [])
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
          if (orderItem.includes('.')) {
            const parts = orderItem.split('.')
            if (parts.length === 2) {
              const [tableName, columnName] = parts
              return `\`${tableName}\`.\`${columnName}\` ASC`
            }
          }
          // If column is unqualified, look up which table it belongs to from SELECT
          if (hasJoins && columnToTable[orderItem]) {
            return `\`${columnToTable[orderItem]}\`.\`${orderItem}\` ASC`
          }
          return `\`${orderItem}\` ASC`
        }
        if (typeof orderItem === 'object') {
          const key = Object.keys(orderItem)[0]
          const direction =
            orderItem[key].toUpperCase() === 'DESC' ? 'DESC' : 'ASC'
          if (key.includes('.')) {
            const parts = key.split('.')
            if (parts.length === 2) {
              const [tableName, columnName] = parts
              return `\`${tableName}\`.\`${columnName}\` ${direction}`
            }
          }
          // If column is unqualified, look up which table it belongs to from SELECT
          if (hasJoins && columnToTable[key]) {
            return `\`${columnToTable[key]}\`.\`${key}\` ${direction}`
          }
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

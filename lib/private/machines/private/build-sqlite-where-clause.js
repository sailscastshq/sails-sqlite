/**
 * buildSqliteWhereClause()
 *
 * Build a SQLite WHERE clause from the specified S3Q `where` clause.
 * Uses parameterized queries for security.
 * > Note: The provided `where` clause is NOT mutated.
 *
 * @param  {Object} whereClause [`where` clause from the criteria of a S3Q]
 * @param  {Object} WLModel
 * @param  {Object?} meta       [`meta` query key from the s3q]
 *
 * @returns {Object}            [{ clause: String, bindings: Array }]
 */
module.exports = function buildSqliteWhereClause(whereClause, WLModel, meta) {
  // Handle null, undefined, or empty `where` clause.
  if (!whereClause || Object.keys(whereClause).length === 0) {
    return { clause: '', bindings: [] }
  }

  const bindings = []

  // Recursively build WHERE clause
  function recurse(branch) {
    const conditions = []

    // Handle AND conditions
    if (branch.and && Array.isArray(branch.and)) {
      const andConditions = branch.and.map((condition) => recurse(condition))
      const andClauses = andConditions
        .filter((c) => c.clause)
        .map((c) => c.clause)
      if (andClauses.length > 0) {
        conditions.push(`(${andClauses.join(' AND ')})`)
      }
    }

    // Handle OR conditions
    if (branch.or && Array.isArray(branch.or)) {
      const orConditions = branch.or.map((condition) => recurse(condition))
      const orClauses = orConditions
        .filter((c) => c.clause)
        .map((c) => c.clause)
      if (orClauses.length > 0) {
        conditions.push(`(${orClauses.join(' OR ')})`)
      }
    }

    // Handle field conditions
    Object.keys(branch).forEach((key) => {
      if (key === 'and' || key === 'or') {
        return // Already handled above
      }

      const value = branch[key]
      let columnName

      // Handle table.column format
      if (key.includes('.')) {
        const parts = key.split('.')
        if (parts.length === 2) {
          const [tableName, colName] = parts
          columnName = `\`${tableName}\`.\`${colName}\``
        } else {
          columnName = key
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
              if (meta && meta.makeLikeModifierCaseInsensitive === true) {
                conditions.push(`LOWER(${columnName}) LIKE LOWER(?)`)
              } else {
                conditions.push(`${columnName} LIKE ?`)
              }
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

    return { clause: conditions.join(' AND ') }
  }

  const result = recurse(whereClause)
  return { clause: result.clause, bindings }
}

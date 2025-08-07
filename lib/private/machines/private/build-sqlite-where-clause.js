/**
 * buildSqliteWhereClause()
 *
 * Build a SQLite WHERE clause from the specified S3Q `where` clause.
 * > Note: The provided `where` clause is NOT mutated.
 *
 * @param  {Object} whereClause [`where` clause from the criteria of a S3Q]
 * @param  {Object} WLModel
 * @param  {Object?} meta       [`meta` query key from the s3q]
 *
 * @returns {String}            [SQLite WHERE clause]
 */
module.exports = function buildSqliteWhereClause(whereClause, WLModel, meta) {
  // Handle empty `where` clause.
  if (Object.keys(whereClause).length === 0) {
    return ''
  }

  // Recursively build and return a transformed `where` clause for use with SQLite.
  function recurse(branch, isRoot = true) {
    const clauses = []
    for (const [key, value] of Object.entries(branch)) {
      if (key === 'and' || key === 'or') {
        const subClauses = value.map((subBranch) => recurse(subBranch, false))
        clauses.push(`(${subClauses.join(` ${key.toUpperCase()} `)})`)
      } else {
        clauses.push(buildConstraint(key, value, WLModel, meta))
      }
    }
    return isRoot ? clauses.join(' AND ') : clauses.join(' AND ')
  }

  return recurse(whereClause)
}

function buildConstraint(columnName, constraint, WLModel, meta) {
  if (typeof constraint !== 'object' || constraint === null) {
    return `${columnName} = ${sqliteEscape(constraint)}`
  }

  const modifierKind = Object.keys(constraint)[0]
  const modifier = constraint[modifierKind]

  switch (modifierKind) {
    case '<':
      return `${columnName} < ${sqliteEscape(modifier)}`
    case '<=':
      return `${columnName} <= ${sqliteEscape(modifier)}`
    case '>':
      return `${columnName} > ${sqliteEscape(modifier)}`
    case '>=':
      return `${columnName} >= ${sqliteEscape(modifier)}`
    case '!=':
      return `${columnName} != ${sqliteEscape(modifier)}`
    case 'nin':
      return `${columnName} NOT IN (${modifier.map(sqliteEscape).join(', ')})`
    case 'in':
      return `${columnName} IN (${modifier.map(sqliteEscape).join(', ')})`
    case 'like':
      let likePattern = modifier
        .replace(/^%/, '.*')
        .replace(/([^\\])%/g, '$1.*')
        .replace(/\\%/g, '%')
      likePattern = `^${likePattern}$`
      let clause = `${columnName} REGEXP '${likePattern}'`
      if (meta && meta.makeLikeModifierCaseInsensitive === true) {
        clause = `LOWER(${columnName}) REGEXP '${likePattern.toLowerCase()}'`
      }
      return clause
    default:
      throw new Error(
        `Consistency violation: \`where\` clause modifier \`${modifierKind}\` is not valid! This should never happen-- a stage 3 query should have already been normalized in Waterline core.`
      )
  }
}

function sqliteEscape(value) {
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`
  }
  if (typeof value === 'boolean') {
    // Match the decimal format that SQLite stores (1.0, 0.0)
    return value ? '1.0' : '0.0'
  }
  if (value === null) {
    return 'NULL'
  }
  return value
}

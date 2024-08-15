const assert = require('assert')

/**
 * reifyValuesToSet()
 *
 * Prepare a dictionary of values to be used in a SQLite database operation.
 * > The provided `valuesToSet` will be mutated in-place.
 *
 * @param {Object} valuesToSet
 * @param {Object} WLModel
 * @param {Object?} meta       [`meta` query key from the s3q]
 */
module.exports = function reifyValuesToSet(valuesToSet, WLModel, meta) {
  assert(valuesToSet !== undefined, '1st argument is required')
  assert(
    typeof valuesToSet === 'object' &&
      valuesToSet !== null &&
      !Array.isArray(valuesToSet) &&
      typeof valuesToSet !== 'function',
    '1st argument must be a dictionary'
  )
  assert(WLModel !== undefined, '2nd argument is required')
  assert(
    typeof WLModel === 'object' &&
      WLModel !== null &&
      !Array.isArray(WLModel) &&
      typeof WLModel !== 'function',
    '2nd argument must be a WLModel, and it has to have a `definition` property for this utility to work.'
  )

  const primaryKeyAttrName = WLModel.primaryKey
  const primaryKeyColumnName = WLModel.attributes[WLModel.primaryKey].columnName

  // Handle primary key
  if (valuesToSet[primaryKeyColumnName] === null) {
    delete valuesToSet[primaryKeyColumnName]
  } else if (valuesToSet[primaryKeyColumnName] !== undefined) {
    // Ensure primary key is a number or string
    if (
      typeof valuesToSet[primaryKeyColumnName] !== 'number' &&
      typeof valuesToSet[primaryKeyColumnName] !== 'string'
    ) {
      throw new Error(
        `Invalid primary key value provided for \`${primaryKeyAttrName}\`. Must be a number or string.`
      )
    }
  }

  // Handle other attributes
  Object.entries(WLModel.attributes).forEach(([attrName, attrDef]) => {
    const columnName = attrDef.columnName
    if (valuesToSet[columnName] === undefined) return

    // Handle JSON type
    if (attrDef.type === 'json' && valuesToSet[columnName] !== null) {
      valuesToSet[columnName] = JSON.stringify(valuesToSet[columnName])
    }

    // Handle date type
    if (attrDef.type === 'ref' && valuesToSet[columnName] instanceof Date) {
      valuesToSet[columnName] = valuesToSet[columnName].toISOString()
    }

    // Handle boolean type
    if (attrDef.type === 'boolean') {
      valuesToSet[columnName] = valuesToSet[columnName] ? 1 : 0
    }
  })

  return valuesToSet
}

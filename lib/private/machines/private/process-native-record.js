const assert = require('assert')

/**
 * processNativeRecord()
 *
 * Modify a native record coming back from the SQLite database so that it matches
 * the expectations of the adapter spec (i.e. still a physical record, but
 * minus any database-specific eccentricities).
 *
 * @param {Object} nativeRecord
 * @param {Object} WLModel
 * @param {Object?} meta       [`meta` query key from the s3q]
 */
module.exports = function processNativeRecord(nativeRecord, WLModel, meta) {
  assert(nativeRecord !== undefined, '1st argument is required')
  assert(
    typeof nativeRecord === 'object' &&
      nativeRecord !== null &&
      !Array.isArray(nativeRecord),
    '1st argument must be a dictionary'
  )
  assert(WLModel !== undefined, '2nd argument is required')
  assert(
    typeof WLModel === 'object' && WLModel !== null && !Array.isArray(WLModel),
    '2nd argument must be a WLModel, and it has to have a `definition` property for this utility to work.'
  )

  // Check out each known attribute and process by column name
  // NOTE: We do NOT rename columnName to attrName here - that's Waterline's job.
  // The adapter must return records with column names, not attribute names.
  Object.entries(WLModel.attributes).forEach(([attrName, attrDef]) => {
    // Use columnName if defined, otherwise fall back to attribute name
    const columnName = attrDef.columnName || attrName

    // Handle JSON type
    if (
      attrDef.type === 'json' &&
      typeof nativeRecord[columnName] === 'string'
    ) {
      try {
        nativeRecord[columnName] = JSON.parse(nativeRecord[columnName])
      } catch (e) {
        // If parsing fails, leave the value as-is
        console.warn(
          `Failed to parse JSON for column ${columnName}: ${e.message}`
        )
      }
    }

    // Handle Date type
    if (
      attrDef.type === 'ref' &&
      typeof nativeRecord[columnName] === 'string'
    ) {
      const timestamp = Date.parse(nativeRecord[columnName])
      if (!isNaN(timestamp)) {
        nativeRecord[columnName] = new Date(timestamp)
      }
    }

    // Handle Number type - SQLite returns numbers as strings with decimals
    // Also ensure auto timestamps are numbers
    if (attrDef.type === 'number') {
      if (typeof nativeRecord[columnName] === 'string') {
        const numericValue = parseFloat(nativeRecord[columnName])
        if (!isNaN(numericValue)) {
          nativeRecord[columnName] = numericValue
        }
      }
      // Ensure auto timestamps are numbers (like sails-postgresql does)
      if (
        (attrDef.autoUpdatedAt || attrDef.autoCreatedAt) &&
        nativeRecord[columnName] !== undefined
      ) {
        nativeRecord[columnName] = Number(nativeRecord[columnName])
      }
    }

    // Handle Boolean type
    if (attrDef.type === 'boolean') {
      // SQLite stores booleans as integers (0 = false, 1 = true)
      // Values may come back as numbers (1, 1.0) or strings ('1', '1.0')
      const rawValue = nativeRecord[columnName]
      if (rawValue !== undefined && rawValue !== null) {
        if (typeof rawValue !== 'boolean') {
          const numericValue =
            typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue
          nativeRecord[columnName] = numericValue !== 0
        }
      }
    }
  })

  return nativeRecord
}

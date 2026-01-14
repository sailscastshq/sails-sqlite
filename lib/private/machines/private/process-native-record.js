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

  // Check out each known attribute...
  Object.entries(WLModel.attributes).forEach(([attrName, attrDef]) => {
    // Use columnName if defined, otherwise fall back to attribute name
    const columnName = attrDef.columnName || attrName

    // If columnName differs from attrName, we need to rename the key
    // SQLite returns data with column names, but Waterline expects attribute names
    if (columnName !== attrName && nativeRecord[columnName] !== undefined) {
      nativeRecord[attrName] = nativeRecord[columnName]
      delete nativeRecord[columnName]
    }

    // Now work with the attribute name
    const phRecordKey = attrName

    // Handle JSON type
    if (
      attrDef.type === 'json' &&
      typeof nativeRecord[phRecordKey] === 'string'
    ) {
      try {
        nativeRecord[phRecordKey] = JSON.parse(nativeRecord[phRecordKey])
      } catch (e) {
        // If parsing fails, leave the value as-is
        console.warn(
          `Failed to parse JSON for attribute ${attrName}: ${e.message}`
        )
      }
    }

    // Handle Date type
    if (
      attrDef.type === 'ref' &&
      typeof nativeRecord[phRecordKey] === 'string'
    ) {
      const timestamp = Date.parse(nativeRecord[phRecordKey])
      if (!isNaN(timestamp)) {
        nativeRecord[phRecordKey] = new Date(timestamp)
      }
    }

    // Handle Number type - SQLite returns numbers as strings with decimals
    if (
      attrDef.type === 'number' &&
      typeof nativeRecord[phRecordKey] === 'string'
    ) {
      const numericValue = parseFloat(nativeRecord[phRecordKey])
      if (!isNaN(numericValue)) {
        nativeRecord[phRecordKey] = numericValue
      }
    }

    // Handle Boolean type
    if (attrDef.type === 'boolean') {
      // SQLite stores booleans as integers (0 = false, 1 = true)
      // Values may come back as numbers (1, 1.0) or strings ('1', '1.0')
      const rawValue = nativeRecord[phRecordKey]
      if (rawValue !== undefined && rawValue !== null) {
        if (typeof rawValue !== 'boolean') {
          const numericValue =
            typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue
          nativeRecord[phRecordKey] = numericValue !== 0
        }
      }
    }

    const isForeignKey = !!attrDef.model
    // Sanity checks:
    if (isForeignKey) {
      assert(
        attrDef.foreignKey,
        'attribute has a `model` property, but wl-schema did not give it `foreignKey: true`!'
      )
    } else {
      assert(
        !attrDef.foreignKey,
        'wl-schema gave this attribute `foreignKey: true`, but it has no `model` property!'
      )
    }

    if (!isForeignKey) return
    if (nativeRecord[phRecordKey] === undefined) return // This is weird, but WL core deals with warning about it.
    if (nativeRecord[phRecordKey] === null) return

    // For SQLite, we don't need to do any special processing for foreign keys
    // as they are typically just stored as integers or strings.
  })

  return nativeRecord
}

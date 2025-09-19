/**
 * Process Each Record
 *
 * Process an array of records, transforming them from their raw SQLite format
 * to the format expected by Waterline. This follows performance best practices.
 */

const _ = require('@sailshq/lodash')
const { eachRecordDeep } = require('waterline-utils')

module.exports = function processEachRecord(options) {
  // Validate options
  if (!options || typeof options !== 'object') {
    throw new Error(
      'Invalid options argument. Options must contain: records, identity, and orm.'
    )
  }

  const { records, identity, orm } = options

  if (!Array.isArray(records)) {
    throw new Error(
      'Invalid option used in options argument. Missing or invalid records.'
    )
  }
  if (typeof identity !== 'string') {
    throw new Error(
      'Invalid option used in options argument. Missing or invalid identity.'
    )
  }
  if (typeof orm !== 'object') {
    throw new Error(
      'Invalid option used in options argument. Missing or invalid orm.'
    )
  }

  // Key the collections by identity instead of column name
  const collections = Object.fromEntries(
    Object.entries(orm.collections).map(([key, val]) => [val.identity, val])
  )

  // Update the orm object with the keyed collections
  orm.collections = collections

  // Process each record
  eachRecordDeep(
    records,
    (record, WLModel) => {
      // Guard against null/undefined WLModel or definition
      if (!WLModel || !WLModel.definition) {
        return
      }

      // Use _.each instead of Object.entries for compatibility
      _.each(WLModel.definition, (attrDef, attrName) => {
        const columnName = attrDef.columnName || attrName

        if (columnName in record) {
          switch (attrDef.type) {
            case 'boolean':
              // SQLite stores booleans as integers, so we need to convert them
              if (typeof record[columnName] !== 'boolean') {
                record[columnName] = record[columnName] === 1
              }
              break

            case 'json':
              // SQLite stores JSON as text, so we need to parse it
              if (record[columnName] !== null) {
                try {
                  record[columnName] = JSON.parse(record[columnName])
                } catch (e) {
                  console.warn(
                    `Failed to parse JSON for attribute ${attrName}:`,
                    e
                  )
                }
              }
              break

            case 'number':
              // Ensure numbers are actually numbers
              record[columnName] = Number(record[columnName])
              break

            case 'date':
            case 'datetime':
              // SQLite doesn't have a native date type, so we need to parse it
              if (
                record[columnName] &&
                typeof record[columnName] === 'string'
              ) {
                record[columnName] = new Date(record[columnName])
              }
              break

            // Add more type conversions as needed
          }
        }
      })
    },
    true,
    identity,
    orm
  )
}

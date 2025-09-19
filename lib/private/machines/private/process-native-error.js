const flaverr = require('flaverr')

module.exports = function processNativeError(err) {
  if (err.footprint !== undefined) {
    return new Error(
      `Consistency violation: Raw error from SQLite arrived with a pre-existing \`footprint\` property! Should never happen... but maybe this error didn't actually come from SQLite..? Here's the error:\n\n\`\`\`\n${err.stack}\n\`\`\`\n`
    )
  }

  // better-sqlite3 uses string-based error codes
  switch (err.code) {
    case 'SQLITE_CONSTRAINT':
    case 'SQLITE_CONSTRAINT_UNIQUE':
      // Check if it's a UNIQUE constraint violation
      if (
        err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        err.message.includes('UNIQUE constraint failed')
      ) {
        // Extract the column name from the error message
        const match = err.message.match(/UNIQUE constraint failed: \w+\.(\w+)/)
        const keys = match && match[1] ? [match[1]] : []

        return flaverr(
          {
            name: 'UsageError',
            code: 'E_UNIQUE',
            message: err.message,
            footprint: {
              identity: 'notUnique',
              keys: keys
            }
          },
          err
        )
      }

      // Generic constraint violation
      return flaverr(
        {
          name: 'UsageError',
          code: 'E_CONSTRAINT',
          message: err.message,
          footprint: {
            identity: 'violation',
            keys: []
          }
        },
        err
      )

    case 'SQLITE_BUSY':
      return flaverr(
        {
          name: 'UsageError',
          code: 'E_BUSY',
          message: err.message,
          footprint: {
            identity: 'busy'
          }
        },
        err
      )

    case 'SQLITE_READONLY':
      return flaverr(
        {
          name: 'UsageError',
          code: 'E_READONLY',
          message: err.message,
          footprint: {
            identity: 'readonly'
          }
        },
        err
      )

    case 'SQLITE_FULL':
      return flaverr(
        {
          name: 'UsageError',
          code: 'E_FULL',
          message: err.message,
          footprint: {
            identity: 'full'
          }
        },
        err
      )

    default:
      // For unhandled errors, return a generic error with footprint
      return flaverr(
        {
          name: 'Error',
          code: 'E_UNKNOWN',
          message: err.message,
          footprint: {
            identity: 'catchall'
          }
        },
        err
      )
  }
}

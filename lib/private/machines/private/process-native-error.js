module.exports = function processNativeError(err) {
  if (err.footprint !== undefined) {
    return new Error(
      `Consistency violation: Raw error from SQLite arrived with a pre-existing \`footprint\` property! Should never happen... but maybe this error didn't actually come from SQLite..? Here's the error:\n\n\`\`\`\n${err.stack}\n\`\`\`\n`
    )
  }

  // SQLite error codes
  const SQLITE_CONSTRAINT = 19
  const SQLITE_BUSY = 5
  const SQLITE_READONLY = 8
  const SQLITE_FULL = 13

  switch (err.code) {
    case SQLITE_CONSTRAINT:
      err.footprint = {
        identity: 'violation',
        keys: []
      }

      // Check if it's a UNIQUE constraint violation
      if (err.message.includes('UNIQUE constraint failed')) {
        err.footprint.identity = 'notUnique'
        const match = err.message.match(/UNIQUE constraint failed: \w+\.(\w+)/)
        if (match && match[1]) {
          err.footprint.keys.push(match[1])
        }
      }
      break

    case SQLITE_BUSY:
      err.footprint = {
        identity: 'busy'
      }
      break

    case SQLITE_READONLY:
      err.footprint = {
        identity: 'readonly'
      }
      break

    case SQLITE_FULL:
      err.footprint = {
        identity: 'full'
      }
      break

    // Add more cases as needed for other error types

    default:
      // For unhandled errors, we might want to set a generic footprint
      err.footprint = {
        identity: 'error'
      }
  }

  return err
}

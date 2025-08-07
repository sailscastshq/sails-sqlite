#!/usr/bin/env node

const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

// __dirname is automatically available in CommonJS

const testFiles = ['adapter.test.js', 'sequence.test.js', 'datatypes.test.js']

function cleanupTestDatabases() {
  try {
    const testDir = __dirname
    const files = fs.readdirSync(testDir)

    // Remove all test database files (*.sqlite, *.sqlite-wal, *.sqlite-shm)
    const dbFiles = files.filter((file) => {
      return file.match(/\.(sqlite|sqlite-wal|sqlite-shm)$/)
    })

    dbFiles.forEach((file) => {
      const filePath = path.join(testDir, file)
      fs.unlinkSync(filePath)
      console.log(`🗑️ Cleaned up: ${file}`)
    })

    if (dbFiles.length === 0) {
      console.log('🧹 No test database files to clean up')
    }
  } catch (error) {
    console.warn(
      '⚠️ Warning: Failed to clean up test database files:',
      error.message
    )
  }
}

async function runTest(testFile) {
  return new Promise((resolve, reject) => {
    const testPath = path.join(__dirname, testFile)
    const child = spawn('node', ['--test', testPath], {
      stdio: 'inherit'
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Test ${testFile} failed with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

async function runAllTests() {
  console.log('🧪 Running sails-sqlite adapter tests...\n')

  // Clean up any leftover database files before starting
  console.log('🧹 Cleaning up any existing test database files...')
  cleanupTestDatabases()

  for (const testFile of testFiles) {
    console.log(`\n📋 Running ${testFile}...`)
    try {
      await runTest(testFile)
      console.log(`✅ ${testFile} passed`)
    } catch (error) {
      console.error(`❌ ${testFile} failed:`, error.message)
      // Clean up before exiting
      console.log('\n🧹 Cleaning up test database files after failure...')
      cleanupTestDatabases()
      process.exit(1)
    }
  }

  console.log('\n🎉 All tests passed!')

  // Clean up after successful test run
  console.log('\n🧹 Cleaning up test database files...')
  cleanupTestDatabases()
}

runAllTests().catch((error) => {
  console.error('❌ Test runner failed:', error)
  process.exit(1)
})

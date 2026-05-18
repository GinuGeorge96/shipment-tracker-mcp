import { fetchShipment } from '../src/services/dbschenker.js'
import { closeBrowser } from '../src/utils/browser.js'

const TEST_REFERENCES = [
  '1806290829',
  '1806273700',
  '1806272330',
  '1806271886',
  '1806270433',
]

const refArg = process.argv[2]
const references = refArg ? [refArg] : TEST_REFERENCES

async function run(): Promise<void> {
  console.log(`\nTesting ${references.length} reference(s)...\n`)

  for (const ref of references) {
    console.log(`─── ${ref} ───`)
    try {
      const result = await fetchShipment(ref)
      console.log(`✓ OK`)
      console.log(`  Sender:   ${result.sender.city ?? result.sender.name}, ${result.sender.countryCode ?? ''}`)
      console.log(`  Receiver: ${result.receiver.city ?? result.receiver.name}, ${result.receiver.countryCode ?? ''}`)
      console.log(`  Packages: ${result.packages.length}`)
      console.log(`  Events:   ${result.trackingHistory.length}`)
      if (result.warnings?.length) {
        console.log(`  Warnings: ${result.warnings.join(', ')}`)
      }
    } catch (err) {
      const error = err as Error
      console.log(`✗ ${error.message}`)
    }
    console.log()
  }

  await closeBrowser()
}

run().catch((err) => {
  console.error('Test script failed:', err)
  process.exit(1)
})

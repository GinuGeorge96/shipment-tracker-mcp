import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { trackShipment, trackShipmentInputSchema } from './tools/trackShipment.js'
import { closeBrowser } from './utils/browser.js'
import { logger } from './utils/logger.js'

const server = new McpServer({
  name: 'shipment-tracker',
  version: '1.0.0',
})

server.tool(
  'track_shipment',
  'Track a DB Schenker shipment by reference number. Returns sender, receiver, package details and full tracking history.',
  trackShipmentInputSchema.shape,
  async (input) => {
    const result = await trackShipment(input)
    return {
      content: [{ type: 'text', text: result }],
    }
  }
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  logger.info('Shipment Tracker MCP server started')
}

process.on('SIGINT', async () => {
  logger.info('Shutting down MCP server')
  await closeBrowser()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  logger.info('Shutting down MCP server')
  await closeBrowser()
  process.exit(0)
})

main().catch((error) => {
  logger.error('Failed to start MCP server', { error: String(error) })
  process.exit(1)
})

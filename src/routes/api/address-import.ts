import '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createJob } from '../../lib/jobStore.js'

const API_BASE = 'https://lod2v2.api.consoir.io/buildings/address'

export const Route = createFileRoute('/api/address-import')({
  component: () => null,
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.CONSOIR_API_KEY
        if (!apiKey) {
          return new Response(
            JSON.stringify({ error: 'CONSOIR_API_KEY not configured' }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          )
        }

        let body: { addresses: string[]; radius?: number; addressFilter?: boolean }
        try {
          body = await request.json()
        } catch {
          return new Response(
            JSON.stringify({ error: 'Invalid JSON body' }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }

        const { addresses, radius, addressFilter } = body
        if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
          return new Response(
            JSON.stringify({ error: 'At least one address is required' }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          )
        }

        // Build query URL
        const url = new URL(API_BASE)
        for (const addr of addresses) {
          url.searchParams.append('q', addr.trim())
        }
        url.searchParams.set('format', 'glb')
        if (radius != null && radius > 0) {
          url.searchParams.set('radius', String(radius))
        }
        if (addressFilter) {
          url.searchParams.set('address_filter', 'true')
        }

        try {
          const res = await fetch(url.toString(), {
            headers: { 'X-API-Key': apiKey },
          })

          if (!res.ok) {
            const text = await res.text().catch(() => '')
            return new Response(
              JSON.stringify({ error: `API error ${res.status}: ${text || res.statusText}` }),
              { status: 502, headers: { 'content-type': 'application/json' } },
            )
          }

          const glbBuffer = Buffer.from(await res.arrayBuffer())
          if (glbBuffer.length === 0) {
            return new Response(
              JSON.stringify({ error: 'No building data found for the given address(es)' }),
              { status: 404, headers: { 'content-type': 'application/json' } },
            )
          }

          const filePath = join(tmpdir(), `address-import-${randomUUID()}.glb`)
          await writeFile(filePath, glbBuffer)

          const label = addresses.length === 1
            ? addresses[0].trim()
            : `${addresses.length} addresses`

          const job = createJob(filePath, 'glb')

          return new Response(
            JSON.stringify({
              jobId: job.id,
              fileName: `${label}.glb`,
              size: glbBuffer.length,
              fileType: 'glb',
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch building data'
          return new Response(
            JSON.stringify({ error: message }),
            { status: 502, headers: { 'content-type': 'application/json' } },
          )
        }
      },
    },
  },
})

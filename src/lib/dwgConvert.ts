import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'

/**
 * Candidate paths for ODA File Converter (ODAFileConverter).
 * https://www.opendesign.com/guestfiles/oda_file_converter
 */
const ODA_PATHS = [
  'ODAFileConverter',
  '/Applications/ODAFileConverter.app/Contents/MacOS/ODAFileConverter',
  '/usr/local/bin/ODAFileConverter',
  '/usr/bin/ODAFileConverter',
  'C:\\Program Files\\ODA\\ODAFileConverter\\ODAFileConverter.exe',
]

async function findODA(): Promise<string | null> {
  for (const candidate of ODA_PATHS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(candidate, [], { stdio: 'pipe', timeout: 5000 })
        proc.on('error', reject)
        // ODA exits quickly with usage info when called without proper args
        proc.on('close', () => resolve())
      })
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

/**
 * Convert a DWG file to DXF using ODA File Converter.
 *
 * ODA CLI: ODAFileConverter <input_dir> <output_dir> <version> <type> <recurse> <audit>
 * - version: "ACAD2018" (or similar)
 * - type: "DXF" for ASCII DXF output
 */
export async function convertDwgToDxf(dwgPath: string): Promise<Buffer> {
  const oda = await findODA()
  if (!oda) {
    throw new Error(
      'DWG conversion requires ODA File Converter.\n' +
      'Download free from opendesign.com/guestfiles/oda_file_converter\n' +
      'Or export your file as DXF from your CAD software.',
    )
  }

  const inputDir = join(tmpdir(), `dwg-in-${randomUUID()}`)
  const outputDir = join(tmpdir(), `dwg-out-${randomUUID()}`)
  mkdirSync(inputDir, { recursive: true })
  mkdirSync(outputDir, { recursive: true })

  // ODA expects the file in the input directory
  const fileName = basename(dwgPath)
  const inputCopy = join(inputDir, fileName)
  const { copyFile } = await import('node:fs/promises')
  await copyFile(dwgPath, inputCopy)

  try {
    await new Promise<void>((resolve, reject) => {
      // ODAFileConverter <inputFolder> <outputFolder> <outputVersion> <outputType> <recurse> <audit>
      const proc = spawn(oda, [
        inputDir,
        outputDir,
        'ACAD2018',  // output DXF version
        'DXF',       // output type
        '0',         // no recursion
        '1',         // audit and fix
      ], { stdio: 'pipe' })

      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))

      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ODA File Converter exited with code ${code}.\n${stderr.slice(0, 400)}`))
      })
    })

    // Find the output DXF file
    const dxfName = fileName.replace(/\.dwg$/i, '.dxf')
    const dxfPath = join(outputDir, dxfName)

    if (!existsSync(dxfPath)) {
      throw new Error('DWG→DXF conversion produced no output file. The DWG may be corrupt or unsupported.')
    }

    return await readFile(dxfPath)
  } finally {
    // Cleanup temp dirs
    const { rm } = await import('node:fs/promises')
    await rm(inputDir, { recursive: true, force: true }).catch(() => {})
    await rm(outputDir, { recursive: true, force: true }).catch(() => {})
  }
}

import { spawn } from 'node:child_process'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const BLENDER_PATHS = [
  'blender',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/local/bin/blender',
  '/usr/bin/blender',
]

async function findBlender(): Promise<string | null> {
  for (const candidate of BLENDER_PATHS) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(candidate, ['--version'], { stdio: 'pipe' })
        proc.on('error', reject)
        proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`exit ${code}`))))
      })
      return candidate
    } catch {
      // try next
    }
  }
  return null
}

const BLENDER_SCRIPT = `
import sys, bpy

argv = sys.argv
idx = argv.index('--') + 1
input_path = argv[idx]
output_path = argv[idx + 1]

# Try to enable the SketchUp importer add-on (may not be available in all builds)
try:
    bpy.ops.preferences.addon_enable(module='io_import_sketchup')
except Exception as e:
    print(f'Warning: could not enable io_import_sketchup: {e}')

# Clear scene
bpy.ops.wm.read_factory_settings(use_empty=True)

# Import SKP
bpy.ops.import_scene.sketchup(filepath=input_path)

# Export as GLB
bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format='GLB',
    use_selection=False,
)
print('Export done:', output_path)
`

/**
 * Convert a SketchUp .skp file to a GLB buffer using Blender.
 * Throws a human-readable error if Blender is not installed or conversion fails.
 */
export async function convertSkpToGlb(skpPath: string): Promise<Buffer> {
  const blender = await findBlender()
  if (!blender) {
    throw new Error(
      'SKP conversion requires Blender to be installed.\n' +
      'Please install Blender (blender.org) or export your file as OBJ or DAE from SketchUp first.',
    )
  }

  const scriptPath = join(tmpdir(), `blender-skp-${randomUUID()}.py`)
  const outPath = join(tmpdir(), `skp-converted-${randomUUID()}.glb`)

  await writeFile(scriptPath, BLENDER_SCRIPT)

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(blender, [
        '--background',
        '--python', scriptPath,
        '--', skpPath, outPath,
      ], { stdio: 'pipe' })

      let stderr = ''
      proc.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
      proc.stdout?.on('data', (_d: Buffer) => { /* suppress Blender verbose output */ })

      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Blender exited with code ${code}.\n${stderr.slice(0, 400)}`))
      })
    })

    return await readFile(outPath)
  } finally {
    await Promise.all([
      unlink(scriptPath).catch(() => {}),
      unlink(outPath).catch(() => {}),
    ])
  }
}

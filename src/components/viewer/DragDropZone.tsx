import { useCallback, useRef, useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'

const ACCEPTED_EXTENSIONS = ['.e57', '.dae', '.obj', '.skp', '.dxf', '.dwg']
const ACCEPT_ATTR = [...ACCEPTED_EXTENSIONS, '.mtl'].join(',')

function getExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export default function DragDropZone() {
  const {
    streamStatus,
    fileName,
    fileSize,
    fileType,
    jobId,
    setUploading,
    setJobId,
    setStreamStatus,
    setFileType,
    setError,
    reset,
    incrementModelVersion,
  } = useViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const mtlInputRef = useRef<HTMLInputElement>(null)
  const textureInputRef = useRef<HTMLInputElement>(null)
  const textureFileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hasMtl, setHasMtl] = useState(false)
  const [hasTextures, setHasTextures] = useState(false)
  const [isAddingCompanion, setIsAddingCompanion] = useState(false)
  // Texture paths extracted from MTL
  const [requiredTextures, setRequiredTextures] = useState<string[]>([])
  const [textureFolder, setTextureFolder] = useState<string | null>(null)

  const handleFile = useCallback(
    async (file: File, mtlFile?: File) => {
      const ext = getExtension(file.name)
      if (!ACCEPTED_EXTENSIONS.includes(`.${ext}`)) {
        setError(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`)
        return
      }
      reset()
      setHasMtl(false)
      setHasTextures(false)
      setRequiredTextures([])
      setTextureFolder(null)
      setUploading(file.name, file.size)

      const form = new FormData()
      form.append('file', file)
      if (ext === 'obj' && mtlFile) {
        form.append('mtl', mtlFile)
      }

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json()
        if (!res.ok) {
          setError(json.error ?? 'Upload failed')
          return
        }
        if (json.hasMtl) setHasMtl(true)
        // Handle texture refs from initial MTL upload
        const texPaths: string[] = json.requiredTextures ?? []
        if (texPaths.length > 0) {
          setRequiredTextures(texPaths)
          const folders = texPaths.map((p: string) => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
          const commonFolder = folders[0] && folders.every((f: string) => f === folders[0]) ? folders[0] : null
          setTextureFolder(commonFolder)
          console.log(`[DragDrop] Initial upload: MTL needs ${texPaths.length} textures, common folder: ${commonFolder}`)
        }
        setFileType(json.fileType ?? ext)
        setJobId(json.jobId)
        setStreamStatus('streaming')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      }
    },
    [reset, setUploading, setJobId, setStreamStatus, setFileType, setError],
  )

  /** Pick main model file + optional companion MTL from a FileList. */
  function pickFiles(files: FileList | File[]): { main: File; mtl?: File } | null {
    const arr = Array.from(files)
    const main = arr.find((f) => ACCEPTED_EXTENSIONS.includes(`.${getExtension(f.name)}`))
    if (!main) return null
    const mtl = arr.find((f) => getExtension(f.name) === 'mtl')
    return { main, mtl }
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const picked = pickFiles(e.dataTransfer.files)
      if (picked) handleFile(picked.main, picked.mtl)
    },
    [handleFile],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const picked = pickFiles(e.target.files)
      if (picked) handleFile(picked.main, picked.mtl)
    }
    e.target.value = ''
  }

  /** Upload companion MTL file to existing job */
  const onMtlChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !jobId) return
    console.log(`[DragDrop] Uploading MTL "${file.name}" (${file.size} bytes) to job ${jobId}`)
    setIsAddingCompanion(true)
    try {
      const form = new FormData()
      form.append('mtl', file)
      const res = await fetch(`/api/companion/${jobId}`, { method: 'POST', body: form })
      const json = await res.json()
      console.log(`[DragDrop] MTL upload response:`, json)
      if (res.ok && json.addedMtl) {
        setHasMtl(true)
        console.log(`[DragDrop] MTL added successfully`)
        // Extract texture info from MTL parsing result
        const texPaths: string[] = json.requiredTextures ?? []
        if (texPaths.length > 0) {
          setRequiredTextures(texPaths)
          // Find common folder prefix (e.g. "textures/")
          const folders = texPaths.map(p => p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '')
          const commonFolder = folders[0] && folders.every(f => f === folders[0]) ? folders[0] : null
          setTextureFolder(commonFolder)
          console.log(`[DragDrop] MTL needs ${texPaths.length} textures, common folder: ${commonFolder}`)
        } else {
          // No textures needed — reload immediately
          incrementModelVersion()
        }
      }
    } catch (err) {
      console.error('[DragDrop] MTL upload error:', err)
    }
    setIsAddingCompanion(false)
  }, [jobId, incrementModelVersion])

  /** Upload texture folder to existing job — maps files to MTL-expected paths */
  const onTextureChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileArr = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (fileArr.length === 0 || !jobId) return
    setIsAddingCompanion(true)
    try {
      const form = new FormData()
      console.log(`[DragDrop] Uploading ${fileArr.length} texture files`)

      for (const f of fileArr) {
        const webkitPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name

        // Try to match against required texture paths by filename
        const baseName = f.name.toLowerCase()
        const matchedPath = requiredTextures.find(rp => {
          const rpBase = rp.split('/').pop()?.toLowerCase()
          return rpBase === baseName
        })

        // Use the MTL-expected path if found, otherwise the webkitRelativePath
        const relativePath = matchedPath || webkitPath
        form.append('textures', f)
        form.append('texturePaths', relativePath)
        console.log(`[DragDrop] Texture: "${f.name}" → "${relativePath}"`)
      }

      const res = await fetch(`/api/companion/${jobId}`, { method: 'POST', body: form })
      const json = await res.json()
      console.log(`[DragDrop] Texture upload response:`, json)
      if (res.ok && json.addedTextures) {
        setHasTextures(true)
        setRequiredTextures([])
        console.log(`[DragDrop] Textures added, incrementing model version`)
        incrementModelVersion()
      } else {
        console.warn(`[DragDrop] Texture upload issue: ok=${res.ok} addedTextures=${json.addedTextures}`, json)
      }
    } catch (err) {
      console.error('[DragDrop] Texture upload error:', err)
    }
    setIsAddingCompanion(false)
  }, [jobId, incrementModelVersion, requiredTextures])

  const [showFiles, setShowFiles] = useState(false)
  const [jobFiles, setJobFiles] = useState<{ hasMtl: boolean; textureFiles: string[] } | null>(null)

  const fetchJobInfo = useCallback(async () => {
    if (!jobId) return
    try {
      const res = await fetch(`/api/model/${jobId}?info=1`)
      if (res.ok) {
        const info = await res.json()
        setJobFiles({ hasMtl: info.hasMtl, textureFiles: info.textureFiles ?? [] })
      }
    } catch { /* ignore */ }
  }, [jobId])

  const isUploading = streamStatus === 'uploading'
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'

  const isObjFile = fileType === 'obj'

  if (isUploading || isAddingCompanion) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-sm">
        <SpinnerIcon className="h-3 w-3 shrink-0 animate-spin text-teal-400" />
        <span className="truncate max-w-[160px] text-white/70">
          {isAddingCompanion ? 'Adding companion file…' : fileName}
        </span>
        {!isAddingCompanion && <span className="text-white/30">{formatBytes(fileSize ?? 0)}</span>}
      </div>
    )
  }

  if (isActive) {
    // Show guided texture upload prompt after MTL is added
    const needsTextures = requiredTextures.length > 0 && !hasTextures

    return (
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-sm">
          <span className="truncate max-w-[160px] text-white/70">{fileName}</span>
          <span className="text-white/25">{formatBytes(fileSize ?? 0)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
            className="ml-1 flex items-center gap-1 rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-medium text-teal-300 hover:bg-teal-500/30 transition"
          >
            <CloudUploadIcon className="h-3 w-3" /> Open File
          </button>
          {/* Companion file buttons for OBJ */}
          {isObjFile && !hasMtl && (
            <button
              onClick={(e) => { e.stopPropagation(); mtlInputRef.current?.click() }}
              className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/30 transition"
            >
              + MTL
            </button>
          )}
          {isObjFile && hasMtl && (
            <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              ✓ MTL
            </span>
          )}
          {isObjFile && hasMtl && (
            <button
              onClick={(e) => { e.stopPropagation(); textureInputRef.current?.click() }}
              className="flex items-center gap-1 rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300 hover:bg-violet-500/30 transition"
            >
              {hasTextures ? '+ More (Folder)' : '+ Texture Folder'}
            </button>
          )}
          {isObjFile && hasMtl && (
            <button
              onClick={(e) => { e.stopPropagation(); textureFileInputRef.current?.click() }}
              className="flex items-center gap-1 rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300 hover:bg-violet-500/30 transition"
            >
              {hasTextures ? '+ More (File)' : '+ Texture File(s)'}
            </button>
          )}
          {/* File browser toggle */}
          {isObjFile && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (!showFiles) fetchJobInfo()
                setShowFiles(!showFiles)
              }}
              className="flex items-center gap-1 rounded bg-white/[0.06] px-2 py-0.5 text-[10px] font-medium text-white/50 hover:bg-white/10 hover:text-white/70 transition"
            >
              📁 Files
            </button>
          )}
          {/* Hidden inputs */}
          <input ref={inputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onInputChange} />
          <input ref={mtlInputRef} type="file" accept=".mtl" className="hidden" onChange={onMtlChange} />
          {/* @ts-expect-error webkitdirectory is non-standard but widely supported */}
          <input ref={textureInputRef} type="file" webkitdirectory="" directory="" className="hidden" onChange={onTextureChange} />
          <input ref={textureFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onTextureChange} />
        </div>

        {/* Guided texture upload prompt */}
        {needsTextures && isObjFile && (
          <div className="absolute top-full left-0 z-50 mt-1 w-96 rounded-lg border border-amber-500/30 bg-[#1a1a2e] p-3 text-xs shadow-xl backdrop-blur-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-amber-400 text-sm">⚠</span>
              <span className="font-semibold text-amber-300">
                MTL references {requiredTextures.length} texture{requiredTextures.length > 1 ? 's' : ''}
              </span>
            </div>
            {textureFolder && (
              <div className="mb-2 text-white/60">
                Please select the <span className="font-mono text-amber-200 bg-white/5 px-1 rounded">{textureFolder.replace(/\/$/, '')}</span> folder:
              </div>
            )}
            <div className="mb-2 max-h-32 overflow-y-auto space-y-0.5 pl-2 border-l border-white/10">
              {requiredTextures.map((t, i) => (
                <div key={i} className="flex items-center gap-1 text-[10px]">
                  <span className="text-amber-400/60">•</span>
                  <span className="text-white/50 font-mono truncate">{t}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => textureInputRef.current?.click()}
              className="w-full rounded-md bg-violet-500/30 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/40 transition"
            >
              📂 Select Texture Folder
            </button>
            <button
              onClick={() => textureFileInputRef.current?.click()}
              className="mt-1 w-full rounded-md bg-violet-500/20 px-3 py-1.5 text-xs font-medium text-violet-200 hover:bg-violet-500/30 transition"
            >
              📄 Select File(s)
            </button>
            <button
              onClick={() => { setRequiredTextures([]); incrementModelVersion() }}
              className="mt-1 w-full rounded-md bg-white/[0.04] px-3 py-1 text-[10px] text-white/40 hover:bg-white/[0.08] transition"
            >
              Skip — load without textures
            </button>
          </div>
        )}

        {/* File browser dropdown */}
        {showFiles && !needsTextures && isObjFile && (
          <div className="absolute top-full left-0 z-50 mt-1 w-80 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-[#1a1a2e] p-3 text-xs shadow-xl backdrop-blur-sm">
            <div className="mb-2 font-semibold text-white/70">Job Files</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-white/40">OBJ:</span>
                <span className="text-white/70">{fileName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white/40">MTL:</span>
                <span className={jobFiles?.hasMtl ? 'text-emerald-400' : 'text-white/30'}>
                  {jobFiles?.hasMtl ? '✓ loaded' : '— not uploaded'}
                </span>
              </div>
              <div className="mt-2">
                <span className="text-white/40">Textures ({jobFiles?.textureFiles.length ?? 0}):</span>
                {jobFiles && jobFiles.textureFiles.length > 0 ? (
                  <div className="mt-1 space-y-0.5 pl-2">
                    {jobFiles.textureFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className="text-emerald-400/60">✓</span>
                        <span className="text-white/50 truncate">{f}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 pl-2 text-[10px] text-white/30">No textures uploaded</div>
                )}
              </div>
            </div>
            <button
              onClick={() => fetchJobInfo()}
              className="mt-2 w-full rounded bg-white/[0.06] px-2 py-1 text-[10px] text-white/50 hover:bg-white/10 transition"
            >
              ↻ Refresh
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all select-none',
        isDragging
          ? 'border-teal-400 bg-teal-400/10'
          : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10',
      ].join(' ')}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onInputChange} />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
        <CloudUploadIcon className="h-7 w-7 text-teal-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">
          {isDragging ? 'Drop your 3D file' : 'Drop a 3D file here'}
        </p>
        <p className="mt-1 text-sm text-white/50">or click to browse</p>
        <p className="mt-1 text-xs text-white/30">E57 · DAE · OBJ (+MTL) · SKP · DXF · DWG</p>
      </div>
    </div>
  )
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 16.5v-9m-3 3l3-3 3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.338-2.32 5.75 5.75 0 011.043 11.095"
      />
    </svg>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

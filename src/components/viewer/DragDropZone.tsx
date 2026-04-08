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
  const [isDragging, setIsDragging] = useState(false)
  const [hasMtl, setHasMtl] = useState(false)
  const [hasTextures, setHasTextures] = useState(false)
  const [isAddingCompanion, setIsAddingCompanion] = useState(false)

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
    setIsAddingCompanion(true)
    try {
      const form = new FormData()
      form.append('mtl', file)
      const res = await fetch(`/api/model/${jobId}`, { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok && json.addedMtl) {
        setHasMtl(true)
        incrementModelVersion()
      }
    } catch { /* ignore */ }
    setIsAddingCompanion(false)
  }, [jobId, incrementModelVersion])

  /** Upload texture images to existing job */
  const onTextureChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    e.target.value = ''
    if (!files || files.length === 0 || !jobId) return
    setIsAddingCompanion(true)
    try {
      const form = new FormData()
      for (const f of Array.from(files)) {
        form.append('textures', f)
        form.append('texturePaths', f.name)
      }
      const res = await fetch(`/api/model/${jobId}`, { method: 'POST', body: form })
      const json = await res.json()
      if (res.ok && json.addedTextures) {
        setHasTextures(true)
        incrementModelVersion()
      }
    } catch { /* ignore */ }
    setIsAddingCompanion(false)
  }, [jobId, incrementModelVersion])

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
    return (
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
        {isObjFile && (
          <button
            onClick={(e) => { e.stopPropagation(); textureInputRef.current?.click() }}
            className="flex items-center gap-1 rounded bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-300 hover:bg-violet-500/30 transition"
          >
            {hasTextures ? '+ More Textures' : '+ Textures'}
          </button>
        )}
        {/* Hidden inputs */}
        <input ref={inputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onInputChange} />
        <input ref={mtlInputRef} type="file" accept=".mtl" className="hidden" onChange={onMtlChange} />
        <input ref={textureInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onTextureChange} />
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

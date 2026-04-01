import { useCallback, useRef, useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'

const ACCEPTED_EXTENSIONS = ['.e57', '.dae', '.obj', '.skp']
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',')

function getExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export default function DragDropZone() {
  const {
    streamStatus,
    fileName,
    fileSize,
    setUploading,
    setJobId,
    setStreamStatus,
    setFileType,
    setError,
    reset,
  } = useViewer()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      const ext = getExtension(file.name)
      if (!ACCEPTED_EXTENSIONS.includes(`.${ext}`)) {
        setError(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`)
        return
      }
      reset()
      setUploading(file.name, file.size)

      const form = new FormData()
      form.append('file', file)

      try {
        const res = await fetch('/api/upload', { method: 'POST', body: form })
        const json = await res.json()

        if (!res.ok) {
          setError(json.error ?? 'Upload failed')
          return
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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const isUploading = streamStatus === 'uploading'
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'

  if (isUploading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm backdrop-blur-sm">
        <SpinnerIcon className="h-4 w-4 shrink-0 animate-spin text-teal-400" />
        <span className="truncate max-w-[200px] text-white/70">Uploading {fileName}…</span>
        <span className="text-white/40">{formatBytes(fileSize ?? 0)}</span>
      </div>
    )
  }

  if (isActive) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm backdrop-blur-sm">
        <span className="truncate max-w-[200px] text-white/80">{fileName}</span>
        <span className="text-white/40">{formatBytes(fileSize ?? 0)}</span>
        <button
          onClick={reset}
          className="ml-auto rounded-md px-2 py-1 text-xs text-white/50 hover:bg-white/10 hover:text-white transition"
        >
          Load new file
        </button>
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
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={onInputChange}
      />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
        <CloudUploadIcon className="h-7 w-7 text-teal-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">
          {isDragging ? 'Drop your 3D file' : 'Drop a 3D file here'}
        </p>
        <p className="mt-1 text-sm text-white/50">or click to browse</p>
        <p className="mt-1 text-xs text-white/30">E57 · DAE · OBJ · SKP</p>
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

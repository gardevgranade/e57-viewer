import { useCallback, useRef, useState } from 'react'
import { useViewer } from '../../lib/viewerState.js'

const ACCEPTED_EXTENSIONS = ['.e57', '.dae', '.obj', '.skp', '.dxf', '.dwg']
const ACCEPT_ATTR = [...ACCEPTED_EXTENSIONS, '.mtl'].join(',')
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tga', 'tiff', 'tif', 'webp', 'exr', 'hdr'])

function getExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

interface FileWithPath { file: File; relativePath: string }
interface PickedFiles { main: File; mtl?: File; textures: FileWithPath[] }

/** Recursively read a dropped FileSystemEntry tree. */
async function readEntry(
  entry: FileSystemEntry,
  basePath: string,
  result: FileWithPath[],
) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntry).file(resolve, reject)
    })
    result.push({ file, relativePath: basePath + entry.name })
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    let entries: FileSystemEntry[] = []
    while (true) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        dirReader.readEntries(resolve, reject)
      })
      if (batch.length === 0) break
      entries = entries.concat(batch)
    }
    for (const e of entries) {
      await readEntry(e, basePath + entry.name + '/', result)
    }
  }
}

/** Read all entries from a DataTransfer (supports folder drops). */
async function readDroppedItems(dataTransfer: DataTransfer): Promise<FileWithPath[]> {
  const result: FileWithPath[] = []
  const items = dataTransfer.items
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry()
      if (entry) await readEntry(entry, '', result)
    }
    return result
  }
  // Fallback: plain file list
  for (const file of Array.from(dataTransfer.files)) {
    result.push({ file, relativePath: file.name })
  }
  return result
}

/** Pick main model file + optional MTL + texture images from a list of files. */
function pickFiles(files: FileWithPath[]): PickedFiles | null {
  const main = files.find(f => ACCEPTED_EXTENSIONS.includes(`.${getExtension(f.file.name)}`))
  if (!main) return null
  const mtl = files.find(f => getExtension(f.file.name) === 'mtl')
  const textures = files.filter(f => IMAGE_EXTENSIONS.has(getExtension(f.file.name)))
  return { main: main.file, mtl: mtl?.file, textures }
}

/** Simple pick from a plain FileList (no paths). */
function pickFilesSimple(fileList: FileList | File[]): PickedFiles | null {
  const arr = Array.from(fileList).map(f => ({ file: f, relativePath: f.name }))
  return pickFiles(arr)
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
  const folderInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleUpload = useCallback(
    async (picked: PickedFiles) => {
      const ext = getExtension(picked.main.name)
      if (!ACCEPTED_EXTENSIONS.includes(`.${ext}`)) {
        setError(`Unsupported file type. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`)
        return
      }
      reset()
      setUploading(picked.main.name, picked.main.size)

      const form = new FormData()
      form.append('file', picked.main)
      if (ext === 'obj' && picked.mtl) {
        form.append('mtl', picked.mtl)
      }
      // Append texture files with their relative paths
      for (const tex of picked.textures) {
        form.append('textures', tex.file)
        form.append('texturePaths', tex.relativePath)
      }

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
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const items = await readDroppedItems(e.dataTransfer)
      const picked = pickFiles(items)
      if (picked) handleUpload(picked)
    },
    [handleUpload],
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const onDragLeave = () => setIsDragging(false)

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const picked = pickFilesSimple(e.target.files)
      if (picked) handleUpload(picked)
    }
    e.target.value = ''
  }

  const onFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const arr: FileWithPath[] = Array.from(e.target.files).map(f => ({
        file: f,
        relativePath: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      }))
      const picked = pickFiles(arr)
      if (picked) handleUpload(picked)
    }
    e.target.value = ''
  }

  const isUploading = streamStatus === 'uploading'
  const isActive = streamStatus === 'streaming' || streamStatus === 'done'

  if (isUploading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs backdrop-blur-sm">
        <SpinnerIcon className="h-3 w-3 shrink-0 animate-spin text-teal-400" />
        <span className="truncate max-w-[160px] text-white/70">{fileName}</span>
        <span className="text-white/30">{formatBytes(fileSize ?? 0)}</span>
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
        <button
          onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
          className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300 hover:bg-amber-500/30 transition"
          title="Open folder with OBJ + MTL + textures"
        >
          <FolderIcon className="h-3 w-3" /> Open Folder
        </button>
        <input ref={inputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onInputChange} />
        {/* @ts-expect-error webkitdirectory is a non-standard but widely supported attribute */}
        <input ref={folderInputRef} type="file" webkitdirectory="" directory="" className="hidden" onChange={onFolderChange} />
      </div>
    )
  }

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition-all select-none',
        isDragging
          ? 'border-teal-400 bg-teal-400/10'
          : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10',
      ].join(' ')}
    >
      <input ref={inputRef} type="file" accept={ACCEPT_ATTR} multiple className="hidden" onChange={onInputChange} />
      {/* @ts-expect-error webkitdirectory is a non-standard but widely supported attribute */}
      <input ref={folderInputRef} type="file" webkitdirectory="" directory="" className="hidden" onChange={onFolderChange} />
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
        <CloudUploadIcon className="h-7 w-7 text-teal-400" />
      </div>
      <div>
        <p className="text-base font-semibold text-white">
          {isDragging ? 'Drop your 3D file or folder' : 'Drop a 3D file or folder here'}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
            className="rounded-lg bg-teal-500/20 px-3 py-1.5 text-xs font-medium text-teal-300 hover:bg-teal-500/30 transition"
          >
            Browse Files
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click() }}
            className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/30 transition"
            title="Open folder with OBJ + MTL + textures"
          >
            Open Folder
          </button>
        </div>
        <p className="mt-2 text-xs text-white/30">E57 · DAE · OBJ (+MTL + textures) · SKP · DXF · DWG</p>
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

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
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

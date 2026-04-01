# E57 Viewer

A full-stack point cloud viewer built with **TanStack Start**, **React Three Fiber**, and **PDAL**.

## Features

- **Drag & drop** upload of `.e57` files
- **Progressive streaming** — point cloud renders while the file is still loading
- **Point cloud rendering** with configurable point size and color modes (RGB / Intensity / Height)
- **Optional mesh overlay** — toggle a Poisson surface reconstruction mesh

## System Dependency: PDAL

PDAL (Point Data Abstraction Library) must be installed on the system. It is used server-side to parse E57 files.

```bash
# macOS
brew install pdal

# Ubuntu / Debian
sudo apt-get install pdal

# Conda (cross-platform)
conda install -c conda-forge pdal
```

Verify: `pdal --version`

## Setup

```bash
npm install
npm run dev
```

The app starts at http://localhost:3000.

## Architecture

- `src/lib/pdal.ts` — spawns PDAL as a child process, emits point batches
- `src/lib/chunkCodec.ts` — binary encode/decode for Float32 point data over SSE
- `src/lib/jobStore.ts` — in-memory job registry with 5-minute TTL cleanup
- `src/routes/api/upload.ts` — `POST /api/upload` (multipart)
- `src/routes/api/stream.$jobId.ts` — `GET /api/stream/:jobId` (SSE)
- `src/routes/api/mesh.$jobId.ts` — `GET /api/mesh/:jobId` (PLY binary)
- `src/components/viewer/` — React Three Fiber viewer components

## Notes

- Uploaded files are stored as temp files and deleted after 5 minutes
- The mesh reconstruction endpoint (`/api/mesh/:jobId`) is called lazily when the user enables the Mesh toggle
- No authentication — this is a local/prototype tool

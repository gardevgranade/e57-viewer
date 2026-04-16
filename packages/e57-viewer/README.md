# @e57/viewer

A reusable React component for viewing E57 point clouds, 3D meshes (OBJ, GLB, GLTF, DAE, DXF, PLY), with built-in measurement tools, surface detection, and more.

## Installation

```bash
npm install @e57/viewer
```

**Peer dependencies:** `react`, `react-dom`, `three`

## Quick Start

```tsx
import { E57Viewer } from '@e57/viewer'
import '@e57/viewer/styles.css'

function App() {
  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <E57Viewer
        modelUrl="/path/to/model.glb"
        modelType="glb"
        fileName="building.glb"
      />
    </div>
  )
}
```

## Data Input Modes

### 1. Direct Model URL

Load a 3D model from a URL:

```tsx
<E57Viewer
  modelUrl="https://example.com/model.glb"
  modelType="glb"
  fileName="model.glb"
/>
```

### 2. In-Memory Model Data

Pass an `ArrayBuffer` directly:

```tsx
<E57Viewer
  modelData={arrayBuffer}
  modelType="obj"
  fileName="model.obj"
/>
```

### 3. Pre-Loaded Point Cloud

Pass point cloud data as typed arrays:

```tsx
<E57Viewer
  pointCloudData={{
    positions: new Float32Array([...]),  // x,y,z interleaved
    colors: new Float32Array([...]),     // r,g,b (0-1 range)
    pointCount: 1000000,
    bbox: { minX: 0, minY: 0, minZ: 0, maxX: 10, maxY: 10, maxZ: 10 },
  }}
  fileName="scan.e57"
/>
```

### 4. Server-Backed (Upload + Streaming)

Configure API endpoints for full upload/streaming support:

```tsx
<E57Viewer
  config={{
    endpoints: {
      upload: '/api/upload',
      stream: '/api/stream',
      model: '/api/model',
      mesh: '/api/mesh',
      companion: '/api/companion',
      addressImport: '/api/address-import',
    },
  }}
/>
```

## Configuration

The `config` prop controls features, endpoints, and defaults:

```tsx
<E57Viewer
  config={{
    // API endpoints (all optional — omit to disable server features)
    endpoints: {
      upload: '/api/upload',         // File upload (POST)
      stream: '/api/stream',         // E57 SSE streaming (GET /:jobId)
      model: '/api/model',           // Model serving (GET /:jobId)
      mesh: '/api/mesh',             // Mesh reconstruction (GET /:jobId)
      companion: '/api/companion',   // Companion files (POST /:jobId)
      addressImport: '/api/address-import', // Address import (POST)
    },

    // Feature toggles (all default to true)
    features: {
      fileUpload: true,          // Drag-drop upload zone
      e57Streaming: true,        // SSE point cloud streaming
      meshReconstruction: true,  // Mesh overlay from point cloud
      surfaceDetection: true,    // Auto surface detection
      measurements: true,        // Measurement tool
      lassoSelection: true,      // Lasso select tool
      boxSelection: true,        // Box select tool
      lightSimulation: true,     // Sun/light simulation
      positioning: true,         // Positioning gizmo
      quadViewport: true,        // Quad viewport layout
      csvExport: true,           // Surface CSV export
      addressImport: true,       // Address import
      shortcuts: true,           // Keyboard shortcuts
    },

    // Appearance & defaults
    theme: 'dark',               // 'dark' | 'light' | 'system'
    defaultPointSize: 1.5,
    defaultColorMode: 'rgb',     // 'rgb' | 'intensity' | 'height'
    defaultUnitSystem: 'metric', // 'metric' | 'imperial'
  }}
/>
```

### Auto-Disabling Features

Features that require a server endpoint are **automatically disabled** if the endpoint is not configured:

| Feature | Required Endpoint |
|---------|------------------|
| `fileUpload` | `endpoints.upload` |
| `e57Streaming` | `endpoints.stream` |
| `meshReconstruction` | `endpoints.mesh` |
| `addressImport` | `endpoints.addressImport` |

## Callbacks

```tsx
<E57Viewer
  onLoad={(info) => {
    console.log('Loaded:', info.totalPoints, 'points')
    console.log('Bounding box:', info.bbox)
  }}
  onError={(message) => {
    console.error('Viewer error:', message)
  }}
  onSurfacesChange={(surfaces) => {
    console.log('Surfaces:', surfaces.length)
  }}
  onMeasurementsChange={(measurements) => {
    console.log('Measurements:', measurements.length)
  }}
/>
```

## Advanced: Hooks

For advanced integrations, you can access internal state via hooks. These must be used inside an `<E57Viewer>` tree:

```tsx
import { useViewer, useConfig, useUnits, useToast } from '@e57/viewer'

function MyCustomPanel() {
  const { surfaces, totalPoints, streamStatus } = useViewer()
  const { features } = useConfig()
  const { fmtLength, unitSystem } = useUnits()
  // ...
}
```

## Supported File Types

| Format | Type | Notes |
|--------|------|-------|
| E57 | Point cloud | Requires streaming endpoint + PDAL backend |
| OBJ | Mesh | Supports MTL + textures |
| GLB/GLTF | Mesh | Binary or JSON |
| DAE | Mesh | Collada |
| PLY | Mesh/Point cloud | |
| DXF | CAD | 2D/3D wireframe |

## Styling

The component ships with bundled CSS — import it once:

```tsx
import '@e57/viewer/styles.css'
```

The component fills its parent container. Set `width` and `height` on the parent or via the `style`/`className` props.

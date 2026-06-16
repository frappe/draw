// Client-side export to PNG/JPEG/SVG/PDF (spec §10). Stub provides the method
// names ExportMenu binds to; the feature agent rasterizes the SVG and produces
// the files (PNG 1x/2x, JPEG white bg, SVG/PDF transparent).
export function useExport(store) {
  return {
    exportPng: () => {},
    exportJpeg: () => {},
    exportSvg: () => {},
    exportPdf: () => {},
    store,
  }
}

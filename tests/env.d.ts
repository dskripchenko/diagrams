/// <reference types="vite/client" />
// Fixtures are imported as text through Vite's `?raw` suffix.
declare module '*.mmd?raw' {
  const source: string
  export default source
}

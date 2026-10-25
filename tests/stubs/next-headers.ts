// Ersatz für "next/headers" in Tests: außerhalb eines Next-Requests wirft das
// echte Modul ("called outside a request scope"). Fest per Alias statt nur per
// vi.mock eingebunden, weil Vitest bei gleichzeitigen dynamischen Importen
// eines gemockten Moduls (lib/tenant-access.ts lädt next/headers dynamisch)
// gelegentlich doch das Original liefert. Tests, die eigene Werte brauchen,
// überschreiben das weiterhin mit vi.mock("next/headers", …).
export async function headers() {
  return new Headers();
}

export async function cookies() {
  return {
    get: () => undefined,
    getAll: () => [],
    has: () => false,
    set: () => {},
    delete: () => {},
  };
}

export async function draftMode() {
  return { isEnabled: false, enable: () => {}, disable: () => {} };
}

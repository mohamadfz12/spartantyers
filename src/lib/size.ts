/**
 * `11R22.5`, `11 R 22.5` and `11r225` are the same tyre as far as a customer is concerned, so
 * every size comparison runs through this key. The shop's filters and the AI assistant's tyre
 * search both use it, so they always agree on what matches. React-free, so the API can import it.
 */
export function sizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

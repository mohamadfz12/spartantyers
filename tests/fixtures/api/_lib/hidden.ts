/** Test function: lives under _lib, so it must never be reachable as a route. */
export default async function handler(_req: any, res: any) {
  res.status(200).json({ leaked: true })
}

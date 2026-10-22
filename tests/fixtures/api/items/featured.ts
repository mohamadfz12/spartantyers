/** Test function: a static file that must win over items/[id].ts. */
export default async function handler(_req: any, res: any) {
  res.status(200).json({ route: 'static' })
}

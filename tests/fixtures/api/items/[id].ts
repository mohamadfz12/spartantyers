/** Test function: a dynamic segment, which lands in req.query.id. */
export default async function handler(req: any, res: any) {
  res.status(200).json({ route: 'dynamic', id: req.query.id })
}

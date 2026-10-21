/** Test function: answers with what the dev API server handed it. */
export default async function handler(req: any, res: any) {
  res.status(200).json({
    method: req.method,
    query: req.query,
    body: req.body === undefined ? '__none__' : req.body,
    forwardedFor: req.headers['x-forwarded-for'],
  })
}

/** Test function: throws, to prove the server answers 500 without leaking the message. */
export default async function handler() {
  throw new Error('secret detail that must not reach the client')
}

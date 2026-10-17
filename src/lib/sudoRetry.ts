import { isSudoPasswordIncorrect, isSudoPasswordRequired } from '@shared/errors'

export async function runWithSudo<T>(
  run: (sudoPassword?: string) => Promise<T>,
  askPassword: (error: string) => Promise<string | null>,
  cache: { current: string | null },
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (!isSudoPasswordRequired(error)) throw error

    let password = cache.current
    let promptError = ''
    while (true) {
      if (!password) {
        password = await askPassword(promptError)
        if (!password) throw error
      }
      try {
        const result = await run(password)
        cache.current = password
        return result
      } catch (sudoError) {
        if (isSudoPasswordIncorrect(sudoError)) {
          cache.current = null
          password = null
          promptError = 'Wrong password. Try again.'
          continue
        }
        throw sudoError
      }
    }
  }
}

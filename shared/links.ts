// External pages the app may open. The renderer can only ask for an id from this list,
// never an arbitrary URL, so a compromised renderer cannot open attacker-chosen links.
export const REPO_URL = 'https://github.com/usmanbhatti-dev/barepane'

export const EXTERNAL_LINKS = {
  website: 'https://barepane.com',
  source: REPO_URL,
  releases: `${REPO_URL}/releases`,
  issues: `${REPO_URL}/issues/new/choose`,
  discussions: `${REPO_URL}/discussions`,
  privacy: `${REPO_URL}/blob/main/PRIVACY.md`,
  license: `${REPO_URL}/blob/main/LICENSE`,
  security: `${REPO_URL}/security/policy`,
} as const

export type ExternalLinkId = keyof typeof EXTERNAL_LINKS

export function isExternalLinkId(value: unknown): value is ExternalLinkId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(EXTERNAL_LINKS, value)
}

export function externalLinkUrl(id: unknown): string {
  if (!isExternalLinkId(id)) throw new Error('Unknown link.')
  return EXTERNAL_LINKS[id]
}

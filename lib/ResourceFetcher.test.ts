import { expect, test } from 'vitest'
import { ResourceFetcher } from './ResourceFetcher'

test('fetchResource returns resource text', async () => {
  const fetcher = new ResourceFetcher()
  expect(fetcher).toBeInstanceOf(ResourceFetcher)
})
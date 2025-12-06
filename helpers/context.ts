import { ContextParser } from 'jsonld-context-parser'
import * as prefixes from './namespaces.ts'

const contextParser = new ContextParser()
export const context = await contextParser.parse({
  '@context': Object.fromEntries(Object.entries(prefixes).map(([key, value]) => [key, value().value]))
})

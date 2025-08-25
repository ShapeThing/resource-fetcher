import { Quad_Subject } from 'npm:@rdfjs/types'
import type { JsonLdContextNormalized } from 'npm:jsonld-context-parser'
import { Branch } from '../ResourceFetcher.ts'

export const toMermaid = (subject: Quad_Subject, branches: Branch[], context: JsonLdContextNormalized) => {
  let chart = `---\nconfig:\n  layout: dagre\n---\nflowchart LR\n\n`

  chart += branches
    .map((branch) => branchToMermaid(branch, context, subject.value))
    .join('')

  chart += `classDef done fill:#97dc97;\n`
  chart += `classDef hasData fill:green,color:white;\n`

  return chart
}

const branchToMermaid = (
  branch: Branch,
  context: JsonLdContextNormalized,
  subject: string = self.crypto.randomUUID(),
  object: string = self.crypto.randomUUID(),
) => {
  let output = ''
  const pathSegment = branch.pathSegment

  const partIdentifiers = new Map<number, string>()
  partIdentifiers.set(0, subject)
  partIdentifiers.set(pathSegment.length, object)
  for (let i = 1; i < pathSegment.length; i++) {
    partIdentifiers.set(i, self.crypto.randomUUID())
  }

  const predicateIds = new Set<string>()

  let hasData = false

  for (const [i, part] of pathSegment.entries()) {
    const partSubject = partIdentifiers.get(i)!
    const partObject = partIdentifiers.get(i + 1)!

    const quads = [...branch.dataPointer.executeAll(pathSegment.slice(0, i + 1)).quads()]

    if (quads.length) hasData = true

    for (const predicate of part.predicates) {
      const predicateId = self.crypto.randomUUID()
      predicateIds.add(predicateId)
      const compactedIri = context.compactIri(predicate.value)
      const label = compactedIri
        .replace(/http:/g, 'http:‎')
        .replace(/https:/g, 'https:‎')
        .replace(/www/g, 'www‎')

      const triple = [
        partSubject,
        '-->',
        `${predicateId}("${label}")`,
        '-->',
        `${partObject}("${quads.length}")`,
      ]

      // Reverse the triple if the path starts with "object"
      if (part.start === 'object') triple.reverse()

      output += triple.join(' ') + '\n'
    }
  }

  for (const child of branch.children) {
    output += branchToMermaid(
      child,
      context,
      // Grab the last object
      partIdentifiers.get(pathSegment.length)!,
    )
  }

  if (hasData) {
    output += `class ${
      [
        ...partIdentifiers.values(),
        ...predicateIds.values(),
      ].join(',')
    } hasData;\n`
  } else if (branch.processed) {
    output += `class ${
      [
        ...partIdentifiers.values(),
        ...predicateIds.values(),
      ].join(',')
    } done;\n`
  }

  return output
}

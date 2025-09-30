import type { Quad_Predicate, Quad_Subject } from '@rdfjs/types'
import { Generator, Parser } from 'sparqljs'
import { cartesian } from '../helpers/cartesian.ts'
import { prefixes } from '../helpers/namespaces.ts'
import type { Branch } from './Branch.ts'

export const generateQuery = (subject: Quad_Subject, depth: number, branches: Branch[], debug: boolean = true): string => {
  const patternsAndValues: Map<string, Quad_Predicate[][]> = new Map()

  for (const branch of branches) {
    if (branch.processed) continue

    // Get array of arrays of predicates for each segment
    // TODO we should probably go into the children of a Branch too.
    const predicateArrays = branch.pathSegment.map((segment) => segment.predicates)
    // Get all possible trails (cartesian product)
    const trails = cartesian(predicateArrays)

    for (const trail of trails) {
      // Build query trail string using start/end from each segment
      const queryParts: string[] = []
      for (let i = 0; i < Math.min(trail.length, depth); i++) {
        const segment = branch.pathSegment[i]
        // Use start/end to determine triple direction
        let subjectVar = `node_${i}`
        let objectVar = `node_${i + 1}`
        if (segment.start === 'object' && segment.end === 'subject') {
          // Reverse direction
          ;[subjectVar, objectVar] = ['reverse_' + objectVar, subjectVar]
        }
        queryParts.push(`?${subjectVar} ?predicate_${queryParts.length} ?${objectVar}`)
      }

      const patternValues = patternsAndValues.get(queryParts.join(' . ')) || []
      patternsAndValues.set(queryParts.join(' . '), [...patternValues, trail.slice(0, depth)])
    }
  }

  const query = `SELECT * WHERE {
      GRAPH ?g {
      ${branches.length === 0 ? `
        VALUES (?node_0) { (<${subject.value}>) }
        ?node_0 ?predicate_0 ?node_1 .
      ` : ''}
        ${
    [...patternsAndValues.entries()].map(([pattern, predicateSets]) => {
      const variables = pattern.split(' ').filter((part) => part.includes('?predicate'))

      const valueSets = predicateSets.map((predicateSet) => `(<${subject.value}> ${predicateSet.map((predicate) => `<${predicate.value}>`).join(' ')})`)
      const deduplicatedValueSets = [...new Set(valueSets)]

      return `{
          VALUES (?node_0 ${variables.join(' ')}) { ${deduplicatedValueSets.join('\n')} }
          ${pattern}
        }`
    }).join('\n UNION \n')
  }
      }
    }`

  if (debug) {
    const parser = new Parser()
    const parsedQuery = parser.parse(query)
    const generator = new Generator({ prefixes })
    return generator.stringify(parsedQuery)
  } else {
    return query
  }
}

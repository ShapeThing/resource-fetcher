import { Quad_Predicate, Quad_Subject } from 'npm:@rdfjs/types'
import { Generator, Parser } from 'npm:sparqljs'
import { cartesian } from '../helpers/cartesian.ts'
import { prefixes } from '../helpers/namespaces.ts'
import { Branch } from './Branch.ts'

export const generateQuery = (subject: Quad_Subject, depth: number, branches: Branch[], debug: boolean = true) => {
  const patternsAndValues: Map<string, Quad_Predicate[][]> = new Map()

  for (const branch of branches) {
    // Get array of arrays of predicates for each segment
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
        ${
    [...patternsAndValues.entries()].map(([pattern, predicateSets]) => {
      const variables = pattern.split(' ').filter((part) => part.includes('?predicate'))

      const valueSets = predicateSets.map((predicateSet) => `(<${subject.value}> ${predicateSet.map((predicate) => `<${predicate.value}>`).join(' ')})`)
      const deduplicatedValueSets = [...new Set(valueSets)]

      // For the initial query we do a ?s ?p ?o
      const initialClause = pattern === '?node_0 ?predicate_0 ?node_1'

      return `{
          ${initialClause ? `VALUES (?node_0) {(<${subject.value}>)}` : `VALUES (?node_0 ${variables.join(' ')}) { ${deduplicatedValueSets.join('\n')} }`}
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

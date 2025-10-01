import type { Quad_Predicate, Quad_Subject } from '@rdfjs/types'
import { Generator, Parser } from 'sparqljs'
import { cartesian } from '../helpers/cartesian.ts'
import { prefixes } from '../helpers/namespaces.ts'
import { getLeafBranches } from '../helpers/getLeafBranches.ts'
import type { Branch } from './Branch.ts'

export const generateQuery = (
  subject: Quad_Subject,
  depth: number,
  branches: Branch[],
  debug: boolean = true
): string => {
  const patternsAndValues: Map<string, Quad_Predicate[][]> = new Map()

  // Helper function to build trail from root to a specific branch
  const buildTrailToBranch = (branch: Branch): Quad_Predicate[][] => {
    const pathSegments: typeof branch.pathSegment = []
    let currentBranch: Branch | null = branch

    // Walk up to root, collecting path segments
    while (currentBranch) {
      pathSegments.unshift(...currentBranch.pathSegment)
      currentBranch = currentBranch.parent
    }

    // Convert path segments to predicate arrays
    const predicateArrays = pathSegments.map(segment => segment.predicates)

    // Get all possible trails (cartesian product)
    return cartesian(predicateArrays)
  }

  // Get all leaf branches and process their complete trails
  const leafBranches = getLeafBranches(branches)
  const processedBranches = new Set<Branch>()

  for (const leafBranch of leafBranches) {
    if (leafBranch.processed || processedBranches.has(leafBranch)) continue

    const trails = buildTrailToBranch(leafBranch)
    processedBranches.add(leafBranch)

    for (const trail of trails) {
      // Build query trail string using segments from the complete path
      const queryParts: string[] = []

      // Rebuild the path segments from the leaf branch to get start/end info
      const pathSegments: typeof leafBranch.pathSegment = []
      let currentBranch: Branch | null = leafBranch
      while (currentBranch) {
        pathSegments.unshift(...currentBranch.pathSegment)
        currentBranch = currentBranch.parent
      }

      for (let i = 0; i < Math.min(trail.length, depth); i++) {
        const segment = pathSegments[i]
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
        branches.length === 0
          ? `
        VALUES (?node_0) { (<${subject.value}>) }
        ?node_0 ?predicate_0 ?node_1 .
      `
          : ''
      }
        ${[...patternsAndValues.entries()]
          .map(([pattern, predicateSets]) => {
            const lastNodeIndex = Math.max(...pattern.split(' ').map(part => parseInt(part.split('_').pop()!)))

            const variables = pattern.split(' ').filter(part => part.includes('?predicate'))

            const valueSets = predicateSets.map(
              predicateSet => `(<${subject.value}> ${predicateSet.map(predicate => `<${predicate.value}>`).join(' ')})`
            )
            const deduplicatedValueSets = [...new Set(valueSets)]

            return `{
          VALUES (?node_0 ${variables.join(' ')}) { ${deduplicatedValueSets.join('\n')} }
          ${pattern} .
          ?node_${lastNodeIndex} ?predicate_${variables.length} ?node_${lastNodeIndex + 1} .
        }`
          })
          .join('\n UNION \n')}
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

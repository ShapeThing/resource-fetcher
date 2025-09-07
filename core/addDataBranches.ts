import TermSet from 'npm:@rdfjs/term-set'
import { allShapeProperties } from '../helpers/allShapeProperties.ts'
import Grapoi from '../helpers/Grapoi.ts'
import { sh } from '../helpers/namespaces.ts'
import parsePath from '../helpers/parsePath.ts'
import { OurQuad } from '../ResourceFetcher.ts'
import { Branch } from './Branch.ts'

export const addDataBranches = (arrayToAppendTo: Branch[], leafQuads: OurQuad[], propertyPointer?: Grapoi, parent?: Branch) => {
  const shapePredicates = propertyPointer
    ? allShapeProperties(propertyPointer).out(sh('path'))
      .map((pathPointer: Grapoi) => {
        const path = parsePath(pathPointer)
        const predicates = path.flatMap((segment) => segment.predicates)
        return predicates
      }).flat()
    : []

  // TODO this last part gets more complex in deeper depths.
  const filteredQuads = leafQuads.filter((quad) => !shapePredicates.some((predicate) => quad.predicate.equals(predicate)))

  const uniquePredicates = new TermSet(filteredQuads.map((quad) => quad.predicate))

  const quadBranches = [...uniquePredicates.values()].map((predicate) => {
    const pathSegment = [
      {
        predicates: [predicate],
        start: 'subject' as const,
        end: 'object' as const,
        quantifier: 'one' as const,
      },
    ]

    return {
      pathSegment,
      depth: parent ? parent.depth + 1 : 0,
      parent: parent ?? null,
      children: [],
      type: 'data',
      // propertyPointer can be added when we have a shape for the particular data via sh:targetClass.
    } satisfies Branch
  })

  arrayToAppendTo.push(...quadBranches)
}

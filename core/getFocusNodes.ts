import factory from '@rdfjs/data-model'
import { NamedNode } from '@rdfjs/types'
import { dash, rdf, rdfs, sh, xsd } from '../helpers/namespaces.ts'
import Grapoi from "../helpers/Grapoi.ts";

const filterOutBoolean = (predicate: NamedNode) => (pointer: Grapoi) =>
  pointer.out(predicate).term?.equals(factory.literal('true', xsd('boolean'))) !== true

type FocusNodeMatchType = 'targetNode' | 'targetClass' | 'implicitClassTarget' | 'targetSubjectsOf' | 'targetObjectsOf'

export interface FocusNodeMatch {
  shapes: Grapoi
  focusNodes: Grapoi
  type: FocusNodeMatchType
}

export const getAllShapes = (shapes: Grapoi): Grapoi => {
  return shapes
    .node()
    .hasOut(rdf('type'), sh('NodeShape'))
    .filter(filterOutBoolean(dash('abstract')))
    .filter(filterOutBoolean(sh('deactivated')))
}

/**
 * Get focus nodes for each shape and match type based on SHACL shapes and data.
 * @param shapes the shapes pointer
 * @param data the data pointer
 * @returns Array of objects: { shapes, focusNodes, type }
 */
export const getFocusNodes = (shapes: Grapoi, data: Grapoi): FocusNodeMatch[] => {
  const allShapes = getAllShapes(shapes)

  const results: FocusNodeMatch[] = []

  allShapes.terms.forEach(shapeTerm => {
    const shape = shapes.node(shapeTerm)

    // 2.1.3.1 Node targets (sh:targetNode)
    const byTargetNode = shape.out(sh('targetNode')).terms
    if (byTargetNode.length > 0) {
      results.push({
        shapes: shape,
        focusNodes: data.node(byTargetNode),
        type: 'targetNode'
      })
    }

    // 2.1.3.2 Class-based Targets (sh:targetClass)
    const byTargetClass = shape
      .out(sh('targetClass'))
      .terms.flatMap(targetClass => data.hasOut(rdf('type'), targetClass).terms)
    if (byTargetClass.length > 0) {
      results.push({
        shapes: shape,
        focusNodes: data.node(byTargetClass),
        type: 'targetClass'
      })
    }

    // 2.1.3.3 Implicit Class Targets
    const byImplicitClassTargets = data.hasOut(
      rdf('type'),
      shape.hasOut(rdf('type'), sh('NodeShape')).hasOut(rdf('type'), rdfs('Class')).terms
    ).terms
    if (byImplicitClassTargets.length > 0) {
      results.push({
        shapes: shape,
        focusNodes: data.node(byImplicitClassTargets),
        type: 'implicitClassTarget'
      })
    }

    // 2.1.3.4 Subjects-of targets (sh:targetSubjectsOf)
    const byTargetSubjectsOf = data.hasOut(shape.out(sh('targetSubjectsOf')).terms).terms
    if (byTargetSubjectsOf.length > 0) {
      results.push({
        shapes: shape,
        focusNodes: data.node(byTargetSubjectsOf),
        type: 'targetSubjectsOf'
      })
    }

    // 2.1.3.5 Objects-of targets (sh:targetObjectsOf)
    const byTargetObjectsOf = data.out(shape.out(sh('targetObjectsOf')).terms).terms
    if (byTargetObjectsOf.length > 0) {
      results.push({
        shapes: shape,
        focusNodes: data.node(byTargetObjectsOf),
        type: 'targetObjectsOf'
      })
    }
  })

  return results
}

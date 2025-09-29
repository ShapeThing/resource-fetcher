import factory from '@rdfjs/data-model'
import type { Bindings, Quad_Object, Quad_Predicate, Quad_Subject } from '@rdfjs/types'
import type { OurQuad } from '../ResourceFetcher.ts'

export const numberedBindingsToQuads = (bindings: Bindings[]): OurQuad[] => {
  const quads: OurQuad[] = []
  const keys: Set<string> = new Set()

  for (const binding of bindings) {
    const bindingKeys = [...binding.keys()].map((variable) => variable.value)
    for (const bindingKey of bindingKeys) keys.add(bindingKey)
  }

  const highestNode = Math.max(
    ...[...keys]
      .filter((key) => key.includes('_'))
      .map((key) => parseInt(key.split('_').pop()!)),
  )

  for (const binding of bindings) {
    for (let depth = 0; depth <= highestNode; depth++) {
      const subject = binding.get(`node_${depth}`)
      const predicate = binding.get(`predicate_${depth}`)
      const object = binding.get(`node_${depth + 1}`)
      const reverseObject = binding.get(`reverse_node_${depth + 1}`)

      if (subject && predicate && object) {
        const quad: OurQuad = factory.quad(
          subject as Quad_Subject,
          predicate as Quad_Predicate,
          object as Quad_Object,
        )
        // We never reach the highestNode as that is only for the last object.
        if (depth === highestNode - 1) quad.isLeaf = true
        quads.push(quad)
      }

      // If there is no object but there is a reverse object the relationship is a reverse.
      if (subject && predicate && reverseObject) {
        const quad: OurQuad = factory.quad(
          reverseObject as Quad_Subject,
          predicate as Quad_Predicate,
          subject as Quad_Object,
        )
        if (depth === highestNode - 1) quad.isLeaf = true
        quad.isReverse = true
        quads.push(quad)
      }
    }
  }

  return quads
}

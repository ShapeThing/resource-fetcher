/**
 * This file is taken from shacl-engine, I could not directly import it as it is not exported
 * and jsr was making it difficult to import it. (I tried to publish at jsr. But that is still not possible)
 */
import namespace from 'npm:@rdfjs/namespace'
import { NamedNode } from 'npm:@rdfjs/types'
import type Grapoi from './Grapoi.ts'
import { nonNullable } from './nonNullable.ts'

const owl = namespace('http://www.w3.org/2002/07/owl#')
const rdf = namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const rdfs = namespace('http://www.w3.org/2000/01/rdf-schema#')
const sh = namespace('http://www.w3.org/ns/shacl#')
const shn = namespace('https://schemas.link/shacl-next#')
const xsd = namespace('http://www.w3.org/2001/XMLSchema#')

const ns = { owl, rdf, rdfs, sh, shn, xsd }

function parseStep(ptr: Grapoi) {
  if (ptr.term.termType !== 'BlankNode') {
    return {
      quantifier: 'one' as const,
      start: 'subject' as const,
      end: 'object' as const,
      predicates: [ptr.term as NamedNode],
    }
  }

  const alternativePtr = ptr.out([ns.sh.alternativePath])

  /** @ts-expect-error type is missing */
  if (alternativePtr.ptrs.length === 1 && alternativePtr.ptrs[0].isList()) {
    return {
      quantifier: 'one' as const,
      start: 'subject' as const,
      end: 'object' as const,
      /** @ts-ignore The typing does not match */
      predicates: [...alternativePtr.list()].map(
        (ptr) => ptr.term as NamedNode,
      ),
    }
  }

  const inversePtr = ptr.out([ns.sh.inversePath])

  if (inversePtr.term) {
    return {
      quantifier: 'one' as const,
      start: 'object' as const,
      end: 'subject' as const,
      predicates: [inversePtr.term as NamedNode],
    }
  }

  const oneOrMorePtr = ptr.out([ns.sh.oneOrMorePath])

  if (oneOrMorePtr.term) {
    return {
      quantifier: 'oneOrMore' as const,
      start: 'subject' as const,
      end: 'object' as const,
      predicates: [oneOrMorePtr.term as NamedNode],
    }
  }

  const zeroOrMorePtr = ptr.out([ns.sh.zeroOrMorePath])

  if (zeroOrMorePtr.term) {
    return {
      quantifier: 'zeroOrMore' as const,
      start: 'subject' as const,
      end: 'object' as const,
      predicates: [zeroOrMorePtr.term as NamedNode],
    }
  }

  const zeroOrOnePtr = ptr.out([ns.sh.zeroOrOnePath])

  if (zeroOrOnePtr.term) {
    return {
      quantifier: 'zeroOrOne' as const,
      start: 'subject' as const,
      end: 'object' as const,
      predicates: [zeroOrOnePtr.term as NamedNode],
    }
  }
}

function parsePath(ptr: Grapoi): PathSegment {
  if (ptr.terms.length === 0) {
    throw new Error('Path pointer must have at least one term.')
  }

  /** @ts-expect-error type is missing */
  if (!ptr.ptrs[0].isList()) {
    return [parseStep(ptr)].filter(nonNullable)
  }

  return [...ptr.list()]
    .map((stepPtr) => parseStep(stepPtr))
    .filter(nonNullable)
}

export default parsePath

export type PathSegment = {
  quantifier: 'one' | 'oneOrMore' | 'zeroOrMore' | 'zeroOrOne'
  start: 'subject' | 'object'
  end: 'subject' | 'object'
  predicates: NamedNode[]
}[]

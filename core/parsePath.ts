/**
 * This file is taken from npm:shacl-engine.
 */
import type { NamedNode, Quad_Predicate } from "@rdfjs/types";
import type { Grapoi } from "./Grapoi.ts";
import { nonNullable } from "../helpers/nonNullable.ts";
import * as ns from "../helpers/namespaces.ts";

function parseStep(ptr: Grapoi) {
  if (ptr.term.termType !== "BlankNode") {
    return {
      quantifier: "one" as const,
      start: "subject" as const,
      end: "object" as const,
      predicates: [ptr.term as NamedNode],
    };
  }

  const alternativePtr = ptr.out([ns.sh.alternativePath]);

  if (alternativePtr.ptrs.length === 1 && alternativePtr.ptrs[0].isList()) {
    return {
      quantifier: "one" as const,
      start: "subject" as const,
      end: "object" as const,
      predicates: [...alternativePtr.list()].map(
        (ptr) => ptr.term as NamedNode
      ),
    };
  }

  const inversePtr = ptr.out([ns.sh.inversePath]);

  if (inversePtr.term) {
    return {
      quantifier: "one" as const,
      start: "object" as const,
      end: "subject" as const,
      predicates: [inversePtr.term as NamedNode],
    };
  }

  const oneOrMorePtr = ptr.out([ns.sh.oneOrMorePath]);

  if (oneOrMorePtr.term) {
    return {
      quantifier: "oneOrMore" as const,
      start: "subject" as const,
      end: "object" as const,
      predicates: [oneOrMorePtr.term as NamedNode],
    };
  }

  const zeroOrMorePtr = ptr.out([ns.sh.zeroOrMorePath]);

  if (zeroOrMorePtr.term) {
    return {
      quantifier: "zeroOrMore" as const,
      start: "subject" as const,
      end: "object" as const,
      predicates: [zeroOrMorePtr.term as NamedNode],
    };
  }

  const zeroOrOnePtr = ptr.out([ns.sh.zeroOrOnePath]);

  if (zeroOrOnePtr.term) {
    return {
      quantifier: "zeroOrOne" as const,
      start: "subject" as const,
      end: "object" as const,
      predicates: [zeroOrOnePtr.term as NamedNode],
    };
  }
}

function parsePath(ptr: Grapoi): Path {
  if (ptr.terms.length === 0) {
    throw new Error("Path pointer must have at least one term.");
  }

  if (!ptr.ptrs[0].isList()) {
    return [parseStep(ptr)].filter(nonNullable);
  }

  return [...ptr.list()]
    .map((stepPtr) => parseStep(stepPtr))
    .filter(nonNullable);
}

export default parsePath;

export type PathSegment = {
  quantifier: "one" | "oneOrMore" | "zeroOrMore" | "zeroOrOne";
  start: "subject" | "object";
  end: "subject" | "object";
  predicates: (Quad_Predicate | NamedNode)[];
};
export type Path = PathSegment[];

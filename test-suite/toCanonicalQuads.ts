import { Parser } from "n3";
import type { Quad } from "n3";

/**
 * Parse a Turtle string and return a sorted array of canonical quad strings.
 * Blank node IDs are replaced with structural signatures so the result is
 * independent of the data-factory that assigned those IDs.
 */
export function toCanonicalQuads(turtle: string): string[] {
  const parser = new Parser();
  const parsed: Quad[] = parser.parse(turtle);

  // Map blank node ID → all quads where it is the subject
  const bnodeSubjectQuads = new Map<string, Quad[]>();
  for (const q of parsed) {
    if (q.subject.termType === "BlankNode") {
      if (!bnodeSubjectQuads.has(q.subject.value)) {
        bnodeSubjectQuads.set(q.subject.value, []);
      }
      bnodeSubjectQuads.get(q.subject.value)!.push(q);
    }
  }

  function termSig(term: Quad["subject"] | Quad["predicate"] | Quad["object"], visited = new Set<string>()): string {
    if (term.termType === "BlankNode") {
      if (visited.has(term.value)) return "_:CYCLE";
      const next = new Set(visited).add(term.value);
      const sigs = (bnodeSubjectQuads.get(term.value) ?? [])
        .map((t) => `${termSig(t.predicate, next)}=${termSig(t.object, next)}`)
        .sort();
      return `[${sigs.join(",")}]`;
    }
    if (term.termType === "Literal") {
      return `"${term.value}"^^${term.datatype.value}@${term.language}`;
    }
    return term.value;
  }

  return parsed
    .map((q) => `${termSig(q.subject)} ${termSig(q.predicate)} ${termSig(q.object)}`)
    .sort();
}

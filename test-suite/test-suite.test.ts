import { assertEquals } from "@std/assert";
import { dirname } from "@std/path";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import dataFactory from "@rdfjs/data-model";
import { write } from "@jeswr/pretty-turtle";
import { Parser } from "n3";
import type { Quad } from "n3";
import datasetFactory from "@rdfjs/dataset";
import type Grapoi from "../helpers/Grapoi.ts";
import grapoi from "grapoi";
import * as prefixes from "../helpers/namespaces.ts";
import { discoverTestCases } from "./cases.ts";
import { createQueryBindingsComunica, createQueryBindingsSpeedy } from "./queryBindings.ts";

/**
 * Parse a Turtle string and return a sorted array of canonical quad strings.
 * Blank node IDs are replaced with structural signatures so the result is
 * independent of the data-factory that assigned those IDs.
 */
function toCanonicalQuads(turtle: string): string[] {
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

// Discover and run test cases
const testSuiteDir = dirname(new URL(import.meta.url).pathname);
const testCases = await discoverTestCases(testSuiteDir);

for (const queryBindings of [createQueryBindingsComunica, createQueryBindingsSpeedy]) {

  for (const testCase of testCases) {
    Deno.test(`suite ${queryBindings.name.replace('createQueryBindings', '')}: ${testCase.name}`, async () => {
      if (!testCase.iri) {
        throw new Error(`Missing iri.txt in ${testCase.path}`);
      }

      if (!testCase.input) {
        throw new Error(`Missing input.ttl in ${testCase.path}`);
      }

      if (!testCase.output) {
        throw new Error(`Missing output.ttl in ${testCase.path}`);
      }

      if (!testCase.steps) {
        throw new Error(`Missing steps.txt in ${testCase.path}`);
      }
      let shapesPointer: Grapoi | undefined = undefined;

      if (testCase.shapeDefinition) {
        const parser = new Parser();
        const quads = parser.parse(testCase.shapeDefinition);
        const dataset = datasetFactory.dataset();
        for (const quad of quads) {
          dataset.add(quad);
        }
        shapesPointer = grapoi({
          dataset,
          factory: dataFactory,
          term: testCase.shapeIri
            ? dataFactory.namedNode(testCase.shapeIri)
            : undefined,
        });
      }

      const resourceFetcher = new ResourceFetcher({
        resourceIri: dataFactory.namedNode(testCase.iri),
        queryBindings: await queryBindings(testCase.input),
        shapesPointer,
        debug: Deno.env.has("DEBUG"),
      });

      const { results, steps } = await resourceFetcher.execute();

      const outputTurtle = await write(results, {
        ordered: true,
        prefixes: Object.fromEntries(
          Object.entries(prefixes).map(([key, ns]) => [key, ns().value])
        ),
      });

      assertEquals(toCanonicalQuads(outputTurtle), toCanonicalQuads(testCase.output));
      assertEquals(steps, testCase.steps);
    });
  }
}

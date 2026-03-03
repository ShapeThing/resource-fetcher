import { assertEquals } from "@std/assert";
import { dirname } from "@std/path";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import dataFactory from "@rdfjs/data-model";
import { QueryEngine } from "@comunica/query-sparql";
import { write } from "@jeswr/pretty-turtle";
import { Parser } from "n3";
import datasetFactory from "@rdfjs/dataset";
import Grapoi from "../helpers/Grapoi.ts";
import grapoi from "grapoi";
import * as prefixes from "../helpers/namespaces.ts";
import { discoverTestCases } from "./cases.ts";

const serializedSource = (value: string) => ({
  type: "serialized",
  value,
  mediaType: "text/turtle",
  baseIRI: "http://example.org/",
});

// Discover and run test cases
const testSuiteDir = dirname(new URL(import.meta.url).pathname);
const testCases = await discoverTestCases(testSuiteDir);

for (const testCase of testCases) {
  Deno.test(`suite: ${testCase.name}`, async () => {
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
      engine: new QueryEngine(),
      sources: [serializedSource(testCase.input)],
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

    assertEquals(outputTurtle.trim(), testCase.output.trim());
    assertEquals(steps, testCase.steps);
  });
}

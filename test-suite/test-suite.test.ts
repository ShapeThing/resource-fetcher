import { assertEquals } from "@std/assert";
import { join, dirname } from "@std/path";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import dataFactory from "@rdfjs/data-model";
import { QueryEngine } from "@comunica/query-sparql";
import { write } from '@jeswr/pretty-turtle';

interface TestCase {
  name: string;
  path: string;
  iri: string;
  steps: number;
  input: string;
  output: string;
  shapeIri?: string;
  shapeDefinition?: string;
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return undefined;
  }
}

async function discoverTestCases(baseDir: string): Promise<TestCase[]> {
  const testCases: TestCase[] = [];
  const entries = [];

  // Get all directories in test-suite
  for await (const entry of Deno.readDir(baseDir)) {
    if (entry.isDirectory) {
      entries.push(entry.name);
    }
  }

  // Filter based on .skip and .only
  const hasOnly = entries.some((name) => name.includes(".only"));

  for (const name of entries) {
    // Skip directories with .skip
    if (name.includes(".skip")) {
      continue;
    }

    // If there's a .only directory, only run those
    if (hasOnly && !name.includes(".only")) {
      continue;
    }

    // Skip the test-suite.ts file itself
    if (name === "test-suite.ts") {
      continue;
    }

    const testPath = join(baseDir, name);
    const iri = await readFileIfExists(join(testPath, "iri.txt"));
    const stepsText = await readFileIfExists(join(testPath, "steps.txt"));
    const input = await readFileIfExists(join(testPath, "input.ttl"));
    const output = await readFileIfExists(join(testPath, "output.ttl"));
    const shapeIri = await readFileIfExists(join(testPath, "shape-iri.txt"));
    const shapeDefinition = await readFileIfExists(join(testPath, "shape.ttl"));

    testCases.push({
      name: name.replace(".only", ""),
      path: testPath,
      iri: iri?.trim() ?? '',
      steps: stepsText ? parseInt(stepsText.trim()) : 0,
      input: input ?? '',
      output: output ?? '',
      shapeIri: shapeIri?.trim(),
      shapeDefinition,
    });
  }

  return testCases;
}

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

    const resourceFetcher = new ResourceFetcher({
      resourceIri: dataFactory.namedNode(testCase.iri),
      engine: new QueryEngine(),
      sources: [testCase.input]
    });

    const results = await resourceFetcher.execute();
    const outputTurtle = await write(results, {
      ordered: true,
    });

    assertEquals(outputTurtle.trim(), testCase.output.trim());
  });
}

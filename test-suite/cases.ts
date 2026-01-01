import { join } from "@std/path";

interface TestCase {
  name: string;
  path: string;
  iri: string;
  steps: number;
  input: string;
  output: string;
  shapeIri?: string;
  shapeDefinition?: string;
  furtherShapes?: string;
}


async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await Deno.readTextFile(path);
  } catch {
    return undefined;
  }
}

export async function discoverTestCases(baseDir: string): Promise<TestCase[]> {
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
    const furtherShapes = await readFileIfExists(join(testPath, "further-shapes.ttl"));

    testCases.push({
      name: name.replace(".only", ""),
      path: testPath,
      iri: iri?.trim() ?? "",
      steps: stepsText ? parseInt(stepsText.trim()) : 0,
      input: input ?? "",
      output: output ?? "",
      shapeIri: shapeIri?.trim(),
      shapeDefinition,
      furtherShapes
    });
  }

  return testCases;
}

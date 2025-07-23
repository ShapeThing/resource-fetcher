import { Parser, Store, DataFactory } from "n3";
import { QueryEngine } from "@comunica/query-sparql";
import { getResource } from "./resource-fetcher.ts";
import { write } from "@jeswr/pretty-turtle";
import { expect } from "jsr:@std/expect";

const { namedNode } = DataFactory;

const tests = Deno.readDir("./test-support");
const parser = new Parser({
  baseIRI: "https://example.org/",
  format: "text/turtle",
});
const engine = new QueryEngine();

for await (const testFolder of tests) {
  Deno.test(`getResource ${testFolder.name}`, async () => {
    const input = await Deno.readTextFile(
      `./test-support/${testFolder.name}/input.ttl`
    );
    const iri = await Deno.readTextFile(
      `./test-support/${testFolder.name}/iri.txt`
    );
    const expectedOutput = await Deno.readTextFile(
      `./test-support/${testFolder.name}/output.ttl`
    );
    const quads = parser.parse(input);
    const store = new Store(quads);

    const result = await getResource({
      subject: namedNode(iri),
      engine,
      sources: [store],
    });

    const serializedResult = await write(result, {
      prefixes: {
        ex: "https://example.org/",
        schema: "https://schema.org/",
      },
    });

    expect(serializedResult.trim()).toEqual(expectedOutput.trim());
  });
}

import { DataFactory, Parser, Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql";
import { getResource } from "./resource-fetcher.ts";
import { write } from "@jeswr/pretty-turtle";
import { expect } from "jsr:@std/expect";
import debug from "debug";

const log = debug("resource-fetcher");
const { namedNode } = DataFactory;

const dir = [...Deno.readDirSync("./test-support")];
const parser = new Parser({
  baseIRI: "https://example.org/",
  format: "text/turtle",
});
const engine = new QueryEngine();

const filtered = dir.some((folder) => folder.name.endsWith(".only"))
  ? dir.filter((folder) => folder.name.endsWith(".only"))
  : dir;
const filtered2 = filtered.filter((folder) => !folder.name.endsWith(".skip"));

for (const testFolder of filtered2) {
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
      prefixes: (parser as any)._prefixes,
    });

    if (serializedResult.trim() !== expectedOutput.trim()) {
      log(serializedResult.trim());
    }

    expect(serializedResult.trim()).toEqual(expectedOutput.trim());
  });
}

// import { expect } from "jsr:@std/expect";
import { QueryEngine } from "npm:@comunica/query-sparql";
import { DataFactory, Parser, Store } from "npm:n3";
import { ResourceFetcher } from "./ResourceFetcher.ts";

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

    const testSettings = (
      await import(`./test-support/${testFolder.name}/settings.ts`)
    ).default;

    const quads = parser.parse(input);
    const store = new Store(quads);

    const resourceFetcher = new ResourceFetcher({
      subject: namedNode(iri),
      engine,
      debug: true,
      sources: [store],
      ...testSettings,
    });

    for await (const step of resourceFetcher.execute()) {
      console.log(step.mermaid);
    }

    // const serializedResult = await write(resultStore, {
    //   prefixes: (parser as unknown as { _prefixes: Record<string, string> })
    //     ._prefixes,
    //   ordered: true,
    // });

    // expect(serializedResult.trim()).toEqual(expectedOutput.trim());
  });
}

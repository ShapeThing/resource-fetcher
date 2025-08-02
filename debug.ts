import { DataFactory, Parser, Store } from "n3";
import { QueryEngine } from "@comunica/query-sparql";
import { getResource } from "./resource-fetcher.ts";
import { write } from "@jeswr/pretty-turtle";

const { namedNode } = DataFactory;

const parser = new Parser({
  baseIRI: "https://example.org/",
  format: "text/turtle",
});
const engine = new QueryEngine();

const input = await Deno.readTextFile("./test-support/shape/input.ttl");
const iri = await Deno.readTextFile("./test-support/shape/iri.txt");
const expectedOutput = await Deno.readTextFile("./test-support/shape/output.ttl");

const quads = parser.parse(input);
const store = new Store(quads);

console.log("Input IRI:", iri.trim());
console.log("Store size:", store.size);

const result = await getResource({
  subject: namedNode(iri.trim()),
  engine,
  sources: [store],
});

console.log("Result size:", result.size);

const serializedResult = await write(result, {
  prefixes: (parser as any)._prefixes,
});

console.log("=== ACTUAL OUTPUT ===");
console.log(serializedResult.trim());

console.log("\n=== EXPECTED OUTPUT ===");
console.log(expectedOutput.trim());

console.log("\n=== MATCH ===");
console.log(serializedResult.trim() === expectedOutput.trim());
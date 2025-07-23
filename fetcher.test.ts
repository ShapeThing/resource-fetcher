import { Parser, Store, DataFactory } from 'n3'
import { QueryEngine } from '@comunica/query-sparql'
import { expect } from "jsr:@std/expect";
import { getResource } from './fetcher.ts';

const { namedNode } = DataFactory;

const allanDoyle = await Deno.readTextFile('./test-support/allan-doyle.ttl')
const parser = new Parser({
    baseIRI: 'http://example.org/',
    format: 'text/turtle',
})
const quads = parser.parse(allanDoyle)
const store = new Store(quads)
const engine = new QueryEngine();

Deno.test("getResource function retrieves the correct resource", async () => {
  const result = await getResource(namedNode('https://example.org/allanDoyle'), engine, [store]);
  console.table(
    [...result].map((i) => [i.subject.value, i.predicate.value, i.object.value])
  );
//   expect(result).toEqual(expect.any(Object));
});

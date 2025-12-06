import { assertEquals } from "@std/assert";
import { generateQuery } from "./generateQuery.ts";
import { rf } from "../helpers/namespaces.ts";
import sparqljs from "sparqljs";

const parser = new sparqljs.Parser();
const generator = new sparqljs.Generator();

const normalize = (query: string): string => {
  const parsed = parser.parse(query);
  return generator.stringify(parsed);
};

Deno.test("no segment to query", () => {
  const query = generateQuery([
    {
      node_0: rf("resource"),
    },
  ]);
  assertEquals(
    normalize(query),
    normalize(`SELECT * WHERE { GRAPH ?g {{
        VALUES (?node_0) {
            (<https://resource-fetcher.shapething.com/#resource>)
        }
        ?node_0 ?predicate_1 ?node_1.
    }}}`)
  );
});

Deno.test("single path segment to query", () => {
  const query = generateQuery([
    {
      node_0: rf("resource"),
      predicate_1: rf("predicateA"),
    },
  ]);
  assertEquals(
    normalize(query),
    normalize(`SELECT * WHERE { GRAPH ?g {{
        VALUES (?node_0 ?predicate_1) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#predicateA>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
    }}}`)
  );
});

Deno.test("single sequence path segment to query", () => {
  const query = generateQuery([
    {
      node_0: rf("resource"),
      predicate_1: rf("predicateA"),
      predicate_2: rf("predicateB"),
    },
  ]);
  assertEquals(
    normalize(query),
    normalize(`SELECT * WHERE { GRAPH ?g {{
        VALUES (?node_0 ?predicate_1 ?predicate_2) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#predicateA> <https://resource-fetcher.shapething.com/#predicateB>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
        ?node_2 ?predicate_3 ?node_3.
    }}}`)
  );
});

Deno.test("two unions query", () => {
  const query = generateQuery([
    {
      node_0: rf("resource"),
      predicate_1: rf("predicateA"),
      predicate_2: rf("predicateB"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("woop"),
    },
  ]);
  assertEquals(
    normalize(query),
    normalize(`SELECT * WHERE { GRAPH ?g {{
        VALUES (?node_0 ?predicate_1 ?predicate_2) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#predicateA> <https://resource-fetcher.shapething.com/#predicateB>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
        ?node_2 ?predicate_3 ?node_3.
    } UNION {
        VALUES (?node_0 ?predicate_1 ) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#woop>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
    }}}`)
  );
});

Deno.test("oneOrMore query", () => {
  const query = generateQuery([
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
    },
    {
      node_0: rf("resource"),
      predicate_1: rf("rest"),
      predicate_2: rf("rest"),
      predicate_3: rf("rest"),
    },
  ]);
  assertEquals(
    normalize(query),
    normalize(`SELECT * WHERE { GRAPH ?g {{
        VALUES (?node_0 ?predicate_1) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#rest>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
    } UNION {
        VALUES (?node_0 ?predicate_1 ?predicate_2) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#rest> <https://resource-fetcher.shapething.com/#rest>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
        ?node_2 ?predicate_3 ?node_3.
    } UNION {
        VALUES (?node_0 ?predicate_1 ?predicate_2 ?predicate_3) {
            (<https://resource-fetcher.shapething.com/#resource> <https://resource-fetcher.shapething.com/#rest> <https://resource-fetcher.shapething.com/#rest> <https://resource-fetcher.shapething.com/#rest>)
        }
        ?node_0 ?predicate_1 ?node_1.
        ?node_1 ?predicate_2 ?node_2.
        ?node_2 ?predicate_3 ?node_3.
        ?node_3 ?predicate_4 ?node_4.
    }}}`)
  );
});

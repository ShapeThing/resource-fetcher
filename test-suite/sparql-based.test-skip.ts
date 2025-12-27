import init, * as oxigraph from "oxigraph/web.js";
import { dirname } from "@std/path";
import { assertEquals } from "@std/assert";
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
import { fromRdf } from "rdf-literal";

/** @ts-ignore */
await init();

const testSuiteDir = dirname(new URL(import.meta.url).pathname);
const testCases = await discoverTestCases(testSuiteDir);

function createStore() {
  const store = new oxigraph.Store();
  for (const testCase of testCases) {
    store.load(testCase.input, {
      format: "text/turtle",
      base_iri: "http://example.org/",
      to_graph_name: oxigraph.namedNode(testCase.iri),
    });
  }
  return store;
}

const store = await createStore();

function executeQuery({
  store,
  query,
}: {
  store: oxigraph.Store;
  query: string | null;
}) {
  const response: any = {
    head: { vars: [] },
    results: { bindings: [] },
  };

  if (!query) {
    response.error = "Empty or missing query parameter";
    return response;
  }

  if (!query.trimStart().toUpperCase().startsWith("SELECT ")) {
    response.error = "Only SELECT queries are supported";
    return response;
  }

  try {
    const results = store.query(query, {
      default_graph: oxigraph.defaultGraph(),
    }) as Map<string, oxigraph.Term>[];

    response.head.vars = Array.from(
      results.length > 0 ? results[0].keys() : []
    );

    for (const binding of results) {
      const result: Record<
        string,
        { type: string; value: string; datatype?: string }
      > = {};
      binding.forEach((value, key) => {
        if (key) {
          if (value.termType === "Literal") {
            console.log(value.value, value.datatype.value, fromRdf(value));
            result[key] = {
              type: "literal",
              value: fromRdf(value),
              datatype: value.datatype.value,
            };
          } else if (value.termType === "NamedNode") {
            result[key] = {
              type: "uri",
              value: value.value,
            };
          } else if (value.termType === "BlankNode") {
            result[key] = {
              type: "bnode",
              value: value.value,
            };
          } else {
            throw new Error(`Unsupported term type: ${value.termType}`);
          }
        }
      });
      response.results.bindings.push(result);
    }
  } catch (error) {
    response.error = (error as Error).message;
  }

  return response;
}

async function handleRequest(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  let query = params.get("query");

  // Handle POST request body
  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await request.text();
      const formParams = new URLSearchParams(body);
      query = formParams.get("query");
    } else if (contentType.includes("application/sparql-query")) {
      query = await request.text();
    }
  }

  if (request.method === "GET" || request.method === "POST") {
    const response = await executeQuery({ store, query });
    const jsonResponse = JSON.stringify(response, null, 2);
    return new Response(jsonResponse, {
      headers: {
        "Content-Type": "application/sparql-results+json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response("Unsupported request method", { status: 405 });
}

// Start the server without blocking
const _server = Deno.serve(
  { port: 8000, hostname: "127.0.0.1" },
  handleRequest
);

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
      sources: [{ type: "sparql", value: "http://localhost:8000" }],
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

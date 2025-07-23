import type { Term } from "@rdfjs/types";
import type { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import { Store } from "n3";

/**
 * The trick of this fetcher,
 * Given a fixed subject, we go into all predicates and see if there are blank nodes as objects.
 * If so we ignore the results (we can not use blank nodes from request A and combine that with request B).
 * We also will trigger a new Sparql query that has a basic graph pattern that goes from subject to predicate to object.
 * If needed it becomes subject to predicate[] to subject.
 */

type QueryExecutor = {
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
};

/**
 * Given a subject IRI and an engine with sources,
 * fetches all triples 'belonging' to a subject.
 */
export const getResource = async ({
  subject,
  engine,
  sources,
  predicates = [],
}: {
  subject: Term;
  predicates?: Term[];
} & QueryExecutor) => {
  const result = await engine.queryQuads(generateQuery(subject, predicates), {
    sources,
    unionDefaultGraph: true,
  });

  const quads = await result.toArray();
  const tempStore = new Store(quads);
  const blankLeafNodes = tempStore.filter(
    (quad) =>
      quad.object.termType === "BlankNode" &&
      // A leaf node's object can not be found as a subject in the store
      !tempStore.match(quad.object as any, null, null, null).size
  );

  const otherNodes = tempStore.difference(blankLeafNodes);
  const store = new Store(otherNodes);

  for (const quad of blankLeafNodes) {
    const childNodes = await getResource({
      subject,
      engine,
      sources,
      predicates: [...predicates, quad.predicate],
    });
    store.addAll(childNodes);
  }

  return store;
};

const generateQuery = (subject: Term, predicates: Term[]) => `
  construct { 
    ${predicates
      .map((_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`)
      .join("\n")}
    ?s${predicates.length} ?p ?o
  } WHERE {
    GRAPH ?g {
      values ?s0 { <${subject.value}> }
      ${predicates
        .map((predicate, index) => `values ?p${index} { <${predicate.value}> }`)
        .join("\n")}
      ${predicates
        .map((_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`)
        .join("\n")}
      ?s${predicates.length} ?p ?o
    }
  }`;

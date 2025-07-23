import type { Term } from "@rdfjs/types";
import { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import { Store } from "n3";

export const getResource = async (
  iri: Term,
  engine: QueryEngine,
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]]
) => {
  const query = `
        construct { ?s ?p ?o } WHERE {
            GRAPH ?g {
                values ?s { <${iri.value}> }
                ?s ?p ?o .
            }
        }
    `;

  const result = await engine.queryQuads(query, {
    sources,
    unionDefaultGraph: true,
    operation: "query",
  });

  const quads = await result.toArray();

  const nonBlankNodes = quads.filter(
    (quad) => quad.object.termType !== "BlankNode"
  );

  const store = new Store(nonBlankNodes);

  const blankNodes = quads.filter(
    (quad) => quad.object.termType === "BlankNode"
  );

  for (const quad of blankNodes) {
    const innerNodes = await resolveBlankNodeTrail(
      quad.subject,
      [quad.predicate],
      engine,
      sources
    );

    store.addQuads([...innerNodes]);
  }

  return store;
};

const resolveBlankNodeTrail = async (
  subject: Term,
  predicates: Term[],
  engine: QueryEngine,
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]]
) => {
  const query = `
    construct { 
        ${predicates
          .map((_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`)
          .join("\n")}
        ?s${predicates.length} ?p ?o
    } WHERE {
        GRAPH ?g {
            values ?s0 { <${subject.value}> }
            ${predicates
              .map(
                (predicate, index) =>
                  `values ?p${index} { <${predicate.value}> }`
              )
              .join("\n")}
            ${predicates
              .map(
                (_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`
              )
              .join("\n")}
            ?s${predicates.length} ?p ?o
        }
    }`;

  const result = await engine.queryQuads(query, {
    sources,
    unionDefaultGraph: true,
    operation: "query",
  });

  const quads = await result.toArray();

  const blankNodes = quads.filter(
    (quad) => quad.object.termType === "BlankNode"
  );

  const nonBlankNodes = quads.filter(
    (quad) => quad.object.termType !== "BlankNode"
  );

  const store = new Store(nonBlankNodes);

  for (const quad of blankNodes) {
    const childNodes = await resolveBlankNodeTrail(
      subject,
      [...predicates, quad.predicate],
      engine,
      sources
    );

    store.addQuads(childNodes);
  }

  return store;
};

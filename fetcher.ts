import type { Term } from "@rdfjs/types";
import { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import { Store } from "n3";

type QueryExecutor = {
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
};

export const getResource = ({
  iri,
  engine,
  sources,
}: {
  iri: Term;
} & QueryExecutor): Promise<Store> => {
  return resolveBlankNodeTrail({
    subject: iri,
    predicates: [],
    engine,
    sources,
  });
};

const resolveBlankNodeTrail = async ({
  subject,
  predicates,
  engine,
  sources,
}: {
  subject: Term;
  predicates: Term[];
} & QueryExecutor) => {
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
  const tempStore = new Store(quads);
  const blankLeafNodes = [...tempStore].filter(
    (quad) => quad.object.termType === "BlankNode" && ![...tempStore].find(innerQuad => quad.object.equals(innerQuad.subject))
  );
  const otherNodes = [...tempStore].filter(quad => !blankLeafNodes.find(blankLeafNode => quad.equals(blankLeafNode)));
  const store = new Store(otherNodes);

  for (const quad of blankLeafNodes) {
      const childNodes = await resolveBlankNodeTrail({
          subject,
          predicates: [...predicates, quad.predicate],
          engine,
          sources,
        });
    store.addQuads([...childNodes]);
  }

  return store;
};

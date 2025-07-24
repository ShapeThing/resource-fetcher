import type {
  Bindings,
  Quad,
  Quad_Object,
  Quad_Predicate,
  Quad_Subject,
  Term,
} from "@rdfjs/types";
import type { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import { Store } from "n3";
import namespace from "@rdfjs/namespace";
import debug from "debug";

export const log = debug("resource-fetcher");

const sh = namespace("http://www.w3.org/ns/shacl#");
const rdf = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");

/**
 * The trick of this fetcher,
 * Given a fixed subject, we go into all predicates and see if there are blank nodes as objects.
 * If so we ignore the results (we can not use blank nodes from request A and combine that with request B).
 * We also will trigger a new Sparql query that has a basic graph pattern that goes from subject to predicate to object.
 * If needed it becomes subject to predicate[] to subject.
 */

type Rule = (quad: Quad, store: Store) => boolean;

const rules: Rule[] = [
  (quad) => quad.object.termType === "BlankNode",
  // (quad) => quad.predicate.equals(sh("node")),
];

// TODO make the query work for all of quadsToExpand

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
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
}): Promise<Store> => {
  const query = generateQuery(subject, predicates);

  log(query);

  const result = await engine.queryBindings(query, {
    sources,
    unionDefaultGraph: true,
    baseIRI: "https://example.org/",
  });

  const bindings = await result.toArray();
  const { quadsToKeep, leafQuads } = bindingsToQuads(bindings);

  const quadsToExpand = leafQuads.filter((quad) =>
    rules.some((rule) => rule(quad, quadsToKeep))
  );

  quadsToKeep.addAll(leafQuads.difference(quadsToExpand));
  const store = new Store(quadsToKeep);

  for (const quad of quadsToExpand) {
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
  select * WHERE {
    graph ?g {
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

const bindingsToQuads = (bindings: Bindings[]) => {
  const quadsToKeep = new Store();
  const leafQuads = new Store();

  for (const binding of bindings) {
    const subjects = [...binding.keys()]
      .filter((key) => key.value.startsWith("s"))
      .sort((a, b) => parseInt(b.value.slice(1)) - parseInt(a.value.slice(1)));


    const highestSubjectIndex = parseInt(subjects[0].value.slice(1));
    for (let i = 0; i <= highestSubjectIndex; i++) {
      const subjectTerm = binding.get(`s${i}`);
      const predicateTerm = binding.get(`p${i}`);
      const objectTerm = binding.get(`s${i + 1}`);
      if (subjectTerm && predicateTerm && objectTerm) {
        quadsToKeep.addQuad(
          subjectTerm as Quad_Subject,
          predicateTerm as Quad_Predicate,
          objectTerm as Quad_Object
        );
      }
    }

    const subjectTerm = binding.get(`s${highestSubjectIndex}`);
    const predicateTerm = binding.get(`p`);
    const objectTerm = binding.get(`o`);
    if (subjectTerm && predicateTerm && objectTerm) {
      leafQuads.addQuad(
        subjectTerm as Quad_Subject,
        predicateTerm as Quad_Predicate,
        objectTerm as Quad_Object
      );
    }
  }

  return { quadsToKeep, leafQuads };
};

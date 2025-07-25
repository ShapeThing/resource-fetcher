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
import debug from "debug";
import TermSet from "@rdfjs/term-set";
import namespace from "@rdfjs/namespace";
const log = debug("resource-fetcher");

const sh = namespace("http://www.w3.org/ns/shacl#");

/**
 * The trick of this fetcher,
 * Given a fixed subject, we go into all predicates and see if there are blank nodes as objects.
 * If so we ignore those results (we can not use blank nodes from request A and combine that with request B).
 * We also will trigger a new Sparql query that has a basic graph pattern that goes from subject to predicate to object.
 * If needed it becomes subject to predicate[] to subject.
 */

type Rule = (quad: Quad, store: Store) => boolean;

const rules: Rule[] = [
  (quad) =>
    quad.object.termType === "BlankNode" ||
    (quad.object.termType === "NamedNode" &&
      quad.object.value.includes("/.well-known/genid/")),
  (quad) =>
    ["node", "property", "or", "and", "hasValue", "in", "xone"].some((name) =>
      quad.predicate.equals(sh(name))
    ),
];

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
  const { quadsToKeep, leafQuads, quadsToExpand } = await executeQueryAndFilter(
    {
      subject,
      predicatePaths: [predicates],
      engine,
      sources,
    }
  );

  quadsToKeep.addAll(leafQuads.difference(quadsToExpand));
  if (quadsToExpand.size === 0) return quadsToKeep;

  const predicatesToExpand = new TermSet(
    [...quadsToExpand].map((quad) => quad.predicate)
  );
  const expansionPaths = [...predicatesToExpand].map((predicate) => [
    ...predicates,
    predicate,
  ]);

  const { quadsToKeep: expansionQuadsToKeep } = await executeQueryAndFilter({
    subject,
    predicatePaths: expansionPaths,
    engine,
    sources,
    existingStore: quadsToKeep,
  });

  quadsToKeep.addAll(expansionQuadsToKeep);

  for (const expansionPath of expansionPaths) {
    const childNodes = await getResource({
      subject,
      engine,
      sources,
      predicates: expansionPath,
    });
    quadsToKeep.addAll(childNodes);
  }

  return quadsToKeep;
};

const executeQueryAndFilter = async ({
  subject,
  predicatePaths,
  engine,
  sources,
  existingStore = new Store(),
}: {
  subject: Term;
  predicatePaths: Term[][];
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  existingStore?: Store;
}) => {
  const query = generateSparqlQuery(subject, predicatePaths);
  log(`Executing query: ${query}`);
  const result = await engine.queryBindings(query, {
    sources,
    unionDefaultGraph: true,
  });
  const bindings = await result.toArray();
  const { quadsToKeep, leafQuads } = bindingsToQuads(bindings);
  const quadsToExpand = leafQuads.filter((quad) =>
    rules.some((rule) => rule(quad, existingStore))
  );
  return { quadsToKeep, leafQuads, quadsToExpand };
};

const generateSparqlQuery = (subject: Term, predicatePaths: Term[][]) => {
  const unionClauses = predicatePaths
    .map(
      (predicates) => `
    {
      values ?s0 { <${subject.value}> }
      ${predicates
        .map((predicate, index) => `values ?p${index} { <${predicate.value}> }`)
        .join("\n")}
      ${predicates
        .map((_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`)
        .join("\n")}
      ?s${predicates.length} ?p ?o
    }`
    )
    .join("\nunion ");

  return `select * WHERE { graph ?g { ${unionClauses} } }`;
};

/**
 * Parses the bindings into quads and also splits the quads in standard quads and leaf quads.
 */
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

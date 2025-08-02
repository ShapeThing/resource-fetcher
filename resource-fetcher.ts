import { LoggerPretty } from "@comunica/logger-pretty";
import type { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import namespace from "@rdfjs/namespace";
import TermSet from "@rdfjs/term-set";
import type {
  Bindings,
  Quad_Object,
  Quad_Predicate,
  Quad_Subject,
  Term,
} from "@rdfjs/types";
import debug from "debug";
import { Store } from "n3";
const log = debug("resource-fetcher");

const sh = namespace("http://www.w3.org/ns/shacl#");

/**
 * The trick of this fetcher,
 * Given a fixed subject, we go into all predicates and see if there are blank nodes as objects.
 * If so we ignore those results (we can not use blank nodes from request A and combine that with request B).
 * We also will trigger a new Sparql query that has a basic graph pattern that goes from subject to predicate to object.
 * If needed it becomes subject to predicate[] to subject.
 */

const referencePredicates = [sh("group"), sh("node"), sh("property")];

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

  if (quadsToExpand.size === 0) {
    return fetchReferences({
      store: quadsToKeep,
      engine,
      sources,
    });
  }

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
  });

  quadsToKeep.addAll(expansionQuadsToKeep);

  await Promise.all(
    expansionPaths.map(async (expansionPath) => {
      const childNodes = await getResource({
        subject,
        engine,
        sources,
        predicates: expansionPath,
      });
      quadsToKeep.addAll(childNodes);
    })
  );

  return fetchReferences({
    store: quadsToKeep,
    engine,
    sources,
  });
};

const fetchReferences = async ({
  store,
  engine,
  sources,
}: {
  store: Store;
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
}): Promise<Store> => {
  for (const referencePredicate of referencePredicates) {
    const referenceObjects = store.match(
      undefined,
      referencePredicate as any,
      undefined
    );
    await Promise.all(
      [...referenceObjects].map(async (referenceObject) => {
        if (!store.match(referenceObject.object as any).size) {
          if (referenceObject.object.termType !== "NamedNode") return;
          log("Fetching reference", referenceObject.object.value);
          const resource = await getResource({
            subject: referenceObject.object,
            engine,
            sources,
          });
          store.addAll(resource);
        }
      })
    );
  }

  return store;
};

const executeQueryAndFilter = async ({
  subject,
  predicatePaths,
  engine,
  sources,
}: {
  subject: Term;
  predicatePaths: Term[][];
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
}) => {
  const query = generateSparqlQuery(subject, predicatePaths);
  log("Executing query", query);
  const result = await engine.queryBindings(query, {
    sources,
    unionDefaultGraph: true,
    baseIRI: "https://shapething.org/",
    log: process.env["DEBUG"]?.includes("resource-fetcher")
      ? new LoggerPretty({ level: "debug" })
      : undefined,
  });
  const bindings = await result.toArray();
  const { quadsToKeep, leafQuads } = bindingsToQuads(bindings);
  const quadsToExpand = leafQuads.filter(
    (quad) =>
      quad.object.termType === "BlankNode" ||
      (quad.object.termType === "NamedNode" &&
        quad.object.value.includes("/.well-known/genid/"))
  );
  return { quadsToKeep, leafQuads, quadsToExpand };
};

const generateSparqlQuery = (subject: Term, predicatePaths: Term[][]) => {
  const unionClauses = predicatePaths
    .map(
      (predicates) => `
    {
      VALUES (?s0 ${predicates
        .map((_, index) => `?p${index}`)
        .join(" ")}) { (<${subject.value}> ${predicates
        .map((predicate) => `<${predicate.value}>`)
        .join("\n")} ) }
      ${predicates
        .map((_predicate, index) => `?s${index} ?p${index} ?s${index + 1} .`)
        .join("\n")}
      ?s${predicates.length} ?p ?o
    }`
    )
    .join("\nUNION ");

  return `SELECT * WHERE { GRAPH ?g { ${unionClauses} } }`;
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

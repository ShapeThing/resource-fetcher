import namespace, { NamespaceBuilder } from "npm:@rdfjs/namespace";
import { ContextParser } from "npm:jsonld-context-parser";
const contextParser = new ContextParser();

/** https://schema.org namespace */
export const schema: NamespaceBuilder<string> = namespace(
  "https://schema.org/"
);

/** http://schema.org namespace */
export const sdo: NamespaceBuilder<string> = namespace("http://schema.org/");

/** rdfs.org namespace */
export const rdfs: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/2000/01/rdf-schema#"
);

/** Dublin Core namespace */
export const dce: NamespaceBuilder<string> = namespace(
  "http://purl.org/dc/elements/1.1/"
);

/** Dublin Core namespace */
export const dct: NamespaceBuilder<string> = namespace(
  "http://purl.org/dc/terms/1.1/"
);

/** rdf namespace */
export const rdf: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
);

/** example.com namespace */
export const ex: NamespaceBuilder<string> = namespace("http://example.com/");

/** SHACL namespace */
export const sh: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/ns/shacl#"
);

/** DASH namespace */
export const dash: NamespaceBuilder<string> = namespace(
  "http://datashapes.org/dash#"
);

/** XSD namespace */
export const xsd: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/2001/XMLSchema#"
);

/** Shapething SHACL renderer namespace */
export const stsr: NamespaceBuilder<string> = namespace(
  "http://ontology.shapething.com/shacl-renderer#"
);

/** Shapething facets namespace */
export const stf: NamespaceBuilder<string> = namespace(
  "http://ontology.shapething.com/facet#"
);

/** editor.js namespace */
export const ed: NamespaceBuilder<string> = namespace("https://editorjs.io/");

/** OWL namespace */
export const owl: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/2002/07/owl#"
);

/** Faker.js namespace */
export const faker: NamespaceBuilder<string> = namespace(
  "https://fakerjs.dev/"
);

/** SKOS namespace */
export const skos: NamespaceBuilder<string> = namespace(
  "http://www.w3.org/2004/02/skos/core#"
);

/** Local app namespace */
export const app: NamespaceBuilder<string> = namespace(
  (globalThis.location?.origin ?? "http://example.com") + "/"
);

/** Genid */
export const genid: NamespaceBuilder<string> = namespace(
  "https://shacl-renderer.shapething.com/.well-known/genid/"
);

export const foaf: NamespaceBuilder<string> = namespace(
  "http://xmlns.com/foaf/0.1/"
);

export const dbo: NamespaceBuilder<string> = namespace(
  "http://dbpedia.org/ontology/"
);

export const og: NamespaceBuilder<string> = namespace("http://ogp.me/ns#");

/** All prefixes used in Shapething */
export const prefixes: Record<string, string> = Object.fromEntries(
  Object.entries({
    schema,
    rdfs,
    rdf,
    ex,
    dce,
    dct,
    sh,
    dash,
    xsd,
    stsr,
    stf,
    ed,
    owl,
    faker,
    skos,
    app,
    foaf,
    dbo,
    og,
  }).map(([alias, namespace]) => [alias, namespace("").value])
);

/** Prefixes as a SPARQL prefixes string */
export const queryPrefixes: string = Object.entries(prefixes)
  .map(([alias, iri]) => `prefix ${alias}: <${iri}>`)
  .join("\n");

export const context = await contextParser.parse({
  "@context": prefixes,
});

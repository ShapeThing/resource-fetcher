import type { NamespaceBuilder } from "@rdfjs/namespace";
import namespace from "@rdfjs/namespace";

/** Resource Fetcher namespace */
export const rf: NamespaceBuilder<string> = namespace(
  "https://resource-fetcher.shapething.com/#"
);

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
export const ex: NamespaceBuilder<string> = namespace("https://example.org/");

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

import debug from "debug";
import { LoggerPretty } from "@comunica/logger-pretty";
import type { QueryEngine } from "@comunica/query-sparql";
import type { QuerySourceUnidentified } from "@comunica/types";
import type {
  Dataset,
  Quad,
  NamedNode,
  Quad_Subject,
  Bindings,
  Term,
  Quad_Object,
  Quad_Predicate,
} from "@rdfjs/types";
import namespace from "@rdfjs/namespace";
import grapoi from "grapoi";
import factory from "@rdfjs/data-model";
import type Grapoi from "./Grapoi.ts";
import { Store, Variable } from "n3";
import process from "node:process";

const sh = namespace("http://www.w3.org/ns/shacl#");
const rdf = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const log = debug("shacl-cbd");

type Options = {
  subject: Quad_Subject;
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  shapes?: Dataset;
  shapesPointer?: Grapoi;
};

type TrailItem = {
  predicate: NamedNode;
  children: TrailItem[];
};

/**
 * SHACL-based Concise Bounded Description (CBD) fetcher.
 *
 * The challenge: Blank nodes from different SPARQL queries get different identifiers,
 * making it impossible to merge results that reference the same logical blank node.
 *
 * Solution: When we encounter a blank node object, we don't include that triple in
 * the final result. Instead, we expand the query pattern to fetch the blank node's
 * content in the same query, preserving blank node identity.
 *
 * Example transformation:
 * Original: subject sh:property _:blank
 * Becomes:  subject sh:property ?x . ?x ?p ?o
 *
 * This ensures all triples involving the same blank node are fetched together,
 * maintaining referential integrity across the graph traversal.
 *
 * For nested structures like:
 * subject sh:property [
 *   sh:path schema:name ;
 *   sh:node [
 *     sh:property [ sh:path schema:givenName ]
 *   ]
 * ]
 *
 * We build progressively longer predicate paths to fetch the entire structure
 * in coordinated queries, avoiding blank node identity conflicts.
 */
export default class ShaclCbc {
  public subject: Quad_Subject;
  #engine: QueryEngine;
  #sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  #shapesPointer?: Grapoi;
  #store: Store = new Store();
  #trails: TrailItem[] = [];

  constructor({ subject, shapes, engine, sources, shapesPointer }: Options) {
    log("Starting SHACL CBD process for subject:", subject.value);
    this.#shapesPointer =
      shapesPointer ??
      (shapes ? grapoi({ factory, dataset: shapes }) : undefined);
    this.#sources = sources;
    this.#engine = engine;
    this.subject = subject;
  }

  async execute() {
    await this.#initialFetch();
    await this.#executeStep();
    // await this.#executeStep();
    // console.log(this.#generateQuery());
  }

  async #initialFetch() {
    const response = await this.#engine.queryQuads(
      `
      CONSTRUCT { ?s ?p ?o } WHERE {
        GRAPH ?g {
          VALUES ?s { <${this.subject.value}> }
          ?s ?p ?o
        }
      }
    `,
      {
        sources: this.#sources,
        unionDefaultGraph: true,
        baseIRI: "http://example.org/",
        log: process.env["DEBUG"]?.includes("resource-fetcher")
          ? new LoggerPretty({ level: "debug" })
          : undefined,
      }
    );

    const quads = await response.toArray();
    for (const quad of quads) {
      if (this.#termCanBeSaved(quad.object)) {
        this.#store.addQuad(quad);
      } else {
        this.#trails.push({
          predicate: quad.predicate as NamedNode,
          children: [],
        });
      }
    }

    // After this first fetch we can set the SHACL shapes pointer
    if (this.#shapesPointer) {
      const types = quads.filter((quad) => quad.predicate.equals(rdf("type")));
      this.#shapesPointer = this.#shapesPointer
        .hasOut(rdf("type"), sh("NodeShape"))
        .hasOut(sh("targetClass"), types);
    }
  }

  #termCanBeSaved(term: Term): boolean {
    // Check if the quad is a blank node or a named node with a specific pattern
    if (term.termType === "BlankNode") {
      return false; // Skip blank nodes
    }
    if (
      term.termType === "NamedNode" &&
      term.value.includes("/.well-known/genid/")
    ) {
      return false; // Skip named nodes with specific pattern
    }
    return true; // Save all other quads
  }

  async #executeStep() {
    if (!this.#trails.length) return;
    const query = this.#generateQuery();
    console.log("Executing query:", query);
    const response = await this.#engine.queryBindings(query, {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: "http://example.org/",
      log: process.env["DEBUG"]?.includes("resource-fetcher")
        ? new LoggerPretty({ level: "debug" })
        : undefined,
    });

    const bindings = await response.toArray();
    const resultStore = this.#parseBindingsToStore(bindings);
    this.#processResultStore(resultStore);
  }

  #processResultStore(store: Store) {
    const { allPaths } = this.#getMeta();
    const pointer = grapoi({
      factory,
      dataset: store,
      term: this.subject,
    });

    for (const path of allPaths) {
      let pathDataPointer = pointer;
      for (const predicate of path)
        pathDataPointer = pathDataPointer.out(predicate);

      // One query trail can have multiple results, so we need to iterate over them
      for (const term of pathDataPointer.terms) {
        if (this.#termCanBeSaved(term)) {
          const quads = pathDataPointer.quads();
          console.log([...quads]);
        } else {
          console.log(path);
        }
      }
    }
  }

  #parseBindingsToStore(bindings: Bindings[]) {
    const { fetchDepths } = this.#getMeta();
    const store = new Store();

    for (const binding of bindings) {
      for (const depth of fetchDepths) {
        const subjectVariable =
          depth === 1 ? `subject` : `depth${depth - 1}_object`;
        const predicateVariable = `depth${depth}_predicate`;
        const objectVariable = `depth${depth}_object`;

        const subject = binding.get(subjectVariable);
        const predicate = binding.get(predicateVariable);
        const object = binding.get(objectVariable);

        if (subject && predicate && object) {
          const quad = factory.quad(
            subject as Quad_Subject,
            predicate as Quad_Predicate,
            object as Quad_Object
          );
          store.addQuad(quad);
        }
      }
    }

    return store;
  }

  #generateQuery(): string {
    const { allPaths, currentDepth, depths } = this.#getMeta();
    return `
    SELECT * WHERE { GRAPH ?g {
      VALUES (?subject ${depths
        .map((depth) => `?depth${depth}_predicate`)
        .join(" ")}) {
        ( ${allPaths.map(
          (path) =>
            `<${this.subject.value}> ${path
              .slice(0, currentDepth)
              .map((term) => `<${term.value}>`)
              .join(" ")}`
        )} )
      }
    ${depths
      .map((depth) => {
        const subject = depth === 1 ? `?subject` : `?depth${depth - 1}_object`;
        const predicate = `?depth${depth}_predicate`;
        const object = `?depth${depth}_object`;
        return `  ${subject} ${predicate} ${object} .`;
      })
      .join("\n")}
      ?depth${currentDepth}_object ?depth${currentDepth + 1}_predicate ?depth${
      currentDepth + 1
    }_object .
    }}
    `;
  }

  #getMeta() {
    const allPaths: Term[][] = [];
    for (const trail of this.#trails) {
      const paths = this.#trailToFlatList(trail);
      allPaths.push(...paths);
    }

    const currentDepth = Math.min(...allPaths.map((path) => path.length));
    const depths = Array.from(Array(currentDepth).keys()).map((d) => d + 1);
    const fetchDepths = Array.from(Array(currentDepth + 1).keys()).map(
      (d) => d + 1
    );

    return {
      allPaths,
      currentDepth,
      depths,
      fetchDepths,
    };
  }

  #trailToFlatList(trailItem: TrailItem): Term[][] {
    const result: Term[][] = [];
    const buildPathsFromNode = (
      node: TrailItem,
      currentPath: Term[] = []
    ): void => {
      const newPath = [node.predicate, ...currentPath];
      if (node.children.length === 0) {
        result.push(newPath);
        return;
      }

      for (const child of node.children) buildPathsFromNode(child, newPath);
    };

    buildPathsFromNode(trailItem);
    return result;
  }
}

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
import { Store } from "n3";
import type { Term as N3Term } from "n3";
import process from "node:process";
import { groupBy } from "lodash-es";

const sh = namespace("http://www.w3.org/ns/shacl#");
const rdf = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#");
const log = debug("shacl-cbd");

type Options = {
  subject: Quad_Subject;
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  maxDepth?: number;
  shapes?: Dataset;
  shapesPointer?: Grapoi;
  predicateBlackList?: Term[];
};

type TrailItem = {
  predicate?: NamedNode;
  children: TrailItem[];
  depth: number;
  shapesPointer?: Grapoi;
  parent?: TrailItem;
  processed?: boolean;
};

type EngineSources = [QuerySourceUnidentified, ...QuerySourceUnidentified[]];

const defaultPredicateBlackList = [sh("shapesGraph")];

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
 *
 */
export default class ShaclCbc {
  public subject: Quad_Subject;
  #engine: QueryEngine;
  #sources: EngineSources;
  #shapesPointer?: Grapoi;
  #store: Store = new Store();
  #predicateBlackList: Term[] = [];
  #maxDepth: number;
  #trails: TrailItem = {
    children: [],
    depth: 0,
  };

  constructor({
    subject,
    shapes,
    engine,
    sources,
    shapesPointer,
    maxDepth,
    predicateBlackList,
  }: Options) {
    log("Starting SHACL CBD process for subject:", subject.value);
    this.#shapesPointer =
      shapesPointer ??
      (shapes ? grapoi({ factory, dataset: shapes }) : undefined);
    this.#sources = sources;
    this.#engine = engine;
    this.subject = subject;
    this.#predicateBlackList = predicateBlackList ?? defaultPredicateBlackList;
    this.#maxDepth = maxDepth ?? 20;
  }

  get #comunicaOptions() {
    return {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: "http://example.org/",
      log: process.env["DEBUG"]?.includes("shacl-cbd")
        ? new LoggerPretty({ level: "debug" })
        : undefined,
    };
  }

  /**
   * A quad comes in and if we return true, it will be stored and its trail will be walked.
   * This is the place where we check in the SHACL shape if the property should be allowed.
   */
  #isAllowed(quad: Quad, trailItem: TrailItem) {
    const isBlacklisted = this.#predicateBlackList.some((predicate) =>
      quad.predicate.equals(predicate)
    );
    if (isBlacklisted) return;
    if (trailItem.depth < this.#maxDepth) return true;

    if (trailItem.depth === 0 && quad.object.termType === "Literal") {
      return true;
    }

    if (quad.object.termType === "BlankNode") {
      return true;
    }

    if (
      trailItem.shapesPointer
        ?.out(sh("property"))
        .hasOut(sh("path"), quad.predicate).terms.length
    ) {
      return true;
    }
  }

  /**
   * The heart beat of the algorithm. Each execution will tell if there should be another round or not.
   */
  async execute(): Promise<Store> {
    await this.#initialFetch();

    let currentCycle = 1;

    let shouldContinue = true;
    while (shouldContinue && currentCycle < this.#maxDepth) {
      shouldContinue = await this.#executeStep();
      log({ currentCycle, shouldContinue });
      currentCycle++;
    }

    log(this.#debugState());
    return this.#store;
  }

  /**
   * The first fetch is similar to an ?s ?p ?o query.
   * After the first fetch we can set the SHACL shapes pointer as we might have rdf:type triples.
   */
  async #initialFetch() {
    const response = await this.#engine.queryQuads(
      `CONSTRUCT { ?s ?p ?o } WHERE {
        GRAPH ?g {
          VALUES ?s { <${this.subject.value}> }
          ?s ?p ?o
        }
      }`,
      this.#comunicaOptions
    );

    const quads = await response.toArray();

    // After this first fetch we can set the SHACL shapes pointer
    if (this.#shapesPointer) {
      const types = quads
        .filter((quad) => quad.predicate.equals(rdf("type")))
        .map((quad) => quad.object);

      const shapesPointer = this.#shapesPointer
        .hasOut(rdf("type"), sh("NodeShape"))
        .hasOut(sh("targetClass"), types);
      this.#shapesPointer = shapesPointer.terms.length
        ? shapesPointer
        : undefined;

      this.#trails.shapesPointer = shapesPointer;
    }

    for (const quad of quads) {
      this.#addQuadToStructure(quad, this.#trails);
    }

    const resultStore = new Store(quads);
    this.#processResultStore(resultStore);
  }

  /**
   * Adds a quad to the structure of trails if it is allowed.
   */
  #addQuadToStructure(quad: Quad, trailItem: TrailItem) {
    if (!this.#isAllowed(quad, trailItem)) return;

    const propertyPointer = trailItem.shapesPointer
      ?.out(sh("property"))
      .hasOut(sh("path"), quad.predicate);

    const existingChild = trailItem.children.find((child) =>
      child.predicate?.equals(quad.predicate as NamedNode)
    );

    if (existingChild) return;

    trailItem.children.push({
      predicate: quad.predicate as NamedNode,
      parent: trailItem,
      depth: trailItem.depth + 1,
      shapesPointer: this.#propertyPointerToNextNodeShape(propertyPointer),
      children: [],
    });
  }

  /**
   * Given a SHACL shape pointer, sets the pointer to the next level.
   */
  #propertyPointerToNextNodeShape(propertyPointer?: Grapoi) {
    if (!propertyPointer) return undefined;
    const originalTerms = propertyPointer.terms;
    const possibleNodes = propertyPointer.out(sh("node")).terms;
    const terms = [...originalTerms, ...possibleNodes];
    return propertyPointer.node(terms);
  }

  /**
   * Executes a single step of the algorithm.
   * It generates a query based on the current trails and fetches the results.
   */
  async #executeStep() {
    if (!this.#trails.children.length) return false;
    const query = this.#generateQuery();
    log("Executing query:", query);
    const response = await this.#engine.queryBindings(
      query,
      this.#comunicaOptions
    );

    const bindings = await response.toArray();
    const resultStore = this.#parseBindingsToStore(bindings);
    return this.#processResultStore(resultStore);
  }

  /**
   * Generates a SPARQL query based on the current trails.
   */
  #generateQuery(): string {
    const { allPaths } = this.#getMeta();
    const pathsGrouped = groupBy(allPaths, (paths) => paths.length);
    const unionsClauses = Object.entries(pathsGrouped).map(
      ([length, paths]) => {
        const currentDepth = parseInt(length);
        const depths = Array.from(Array(currentDepth).keys()).map((d) => d + 1);
        const materializedPaths = paths.map(
          (path) =>
            `( <${this.subject.value}> ${path
              .slice(0, currentDepth)
              .map((term) => `<${term.value}>`)
              .join(" ")} )`
        );
        const uniquePaths = [...new Set(materializedPaths)];

        return `{
      VALUES (?subject ${depths
        .map((depth) => `?depth${depth}_predicate`)
        .join(" ")}) {
        ${uniquePaths.join("\n        ")}
      }
    ${depths
      .map((depth) => {
        const subject = depth === 1 ? `?subject` : `?depth${depth - 1}_object`;
        const predicate = `?depth${depth}_predicate`;
        const object = `?depth${depth}_object`;
        return `  ${subject} ${predicate} ${object} .`;
      })
      .join("\n    ")}
      OPTIONAL {
        ?depth${currentDepth}_object ?depth${
          currentDepth + 1
        }_predicate ?depth${currentDepth + 1}_object .
      }
    }`;
      }
    );

    return `
    SELECT * WHERE { GRAPH ?g {
      ${unionsClauses.join("\n      UNION\n")}
    }}
    `;
  }

  /**
   * We use a select SPARQL query as it gives us a way of fetching triples
   * while also finding out which of these triples are leaf quads.
   */
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

  /**
   * After the query is executed we process the result store.
   * This will walk the trails and add new quads to the structure.
   * If a trail has been processed, it will not be processed again.
   * If a trail needs another cycle, it will be marked as such.
   * If a trail has no more children, it will be marked as processed.
   */
  #processResultStore(store: Store) {
    const pointer = grapoi({
      factory,
      dataset: store,
      term: this.subject,
    });

    let algorithmNeedsAnotherCycle = false;

    for (const child of this.#trails.children) {
      let branchNeedsAnotherCycle = false;
      const childPaths = this.#trailToFlatList(child);

      for (const path of childPaths) {
        let pathTrailPointer: TrailItem = this.#trails as TrailItem;
        for (const predicate of path) {
          pathTrailPointer = pathTrailPointer.children.find(
            (trailItem: TrailItem) => trailItem.predicate?.equals(predicate)
          )!;
        }

        let pathDataPointer = pointer;
        const trailQuads: Quad[] = [];
        for (const predicate of path) {
          trailQuads.push(...pathDataPointer.quads());
          pathDataPointer = pathDataPointer.distinct().out(predicate);
        }

        // One query trail can have multiple results, so we need to iterate over them
        // These are leaf quads as we use distinct.
        const trailLeafQuads: Quad[] = [...pathDataPointer.quads()];

        for (const trailLeafQuad of trailLeafQuads) {
          const nextQuads = [...store.match(trailLeafQuad.object as N3Term)];

          for (const nextQuad of nextQuads) {
            if (this.#isAllowed(nextQuad, pathTrailPointer)) {
              branchNeedsAnotherCycle = true;
            }

            this.#addQuadToStructure(nextQuad, pathTrailPointer);
          }
        }
      }

      if (branchNeedsAnotherCycle) {
        algorithmNeedsAnotherCycle = true;
      } else {
        this.#store.addAll(store);
        child.processed = true;
      }
    }

    log({ algorithmNeedsAnotherCycle });
    return algorithmNeedsAnotherCycle;
  }

  /**
   * Returns metadata about the current state of the trails.
   * This includes all paths, the current depth, and the available fetch depths.
   */
  #getMeta() {
    const allPaths: Term[][] = [];
    for (const trail of this.#trails.children) {
      const paths = this.#trailToFlatList(trail);
      allPaths.push(...paths);
    }

    const currentDepth = Math.max(...allPaths.map((path) => path.length));
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

  /**
   * Converts a tree of TrailItems into a flat list of paths.
   * Each path is represented as an array of Terms (predicates).
   */
  #trailToFlatList(trailItem: TrailItem): Term[][] {
    const result: Term[][] = [];
    const buildPathsFromNode = (
      trailItem: TrailItem,
      currentPath: Term[] = []
    ): void => {
      const newPath = [trailItem.predicate, ...currentPath].filter(
        Boolean
      ) as Term[];
      if (trailItem.children.length === 0) {
        result.push(newPath);
        return;
      }

      for (const child of trailItem.children) {
        buildPathsFromNode(child, newPath);
      }
    };

    buildPathsFromNode(trailItem);
    return result.map((path) => path.toReversed());
  }

  /**
   * Pretty prints the state so you can debug.
   */
  #debugState() {
    return JSON.stringify(
      this.#trails,
      (key: string, value: unknown) => {
        if (key === "parent") return undefined;
        if (key === "shapesPointer") return !!(value as Grapoi)?.terms.length;
        if (key === "predicate") return (value as Term).value;
        if (key === "children" && (value as TrailItem[]).length === 0)
          return undefined;
        return value;
      },
      2
    );
  }
}

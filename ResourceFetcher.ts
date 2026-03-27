import type { Bindings, DatasetCore, NamedNode, Quad, Quad_Subject } from "@rdfjs/types";
import type { IQueryEngine, QuerySourceUnidentified } from "@comunica/types";
import { allShapeSubShapes } from "./helpers/allShapeSubShapes.ts";
import { sh } from "./helpers/namespaces.ts";
import parsePath, { type Path } from "./core/parsePath.ts";
import { Branch, type BranchSnapshot, type QueryPattern } from "./core/Branch.ts";
import { generateQuery } from "./core/generateQuery.ts";
import { numberedBindingsToQuads } from "./core/numberedBindingsToQuads.ts";
import dataFactory from "@rdfjs/data-model";
import type Grapoi from "./helpers/Grapoi.ts";
import datasetFactory from "@rdfjs/dataset";

export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean };

/**
 * Structured events emitted by ResourceFetcher during execution.
 * Pass a callback of type `(event: DebugEvent) => void` as the `debug` option
 * to receive them.
 */
export type DebugEvent =
  /** A SPARQL query is about to be sent. step=0 means the graph-detection query. */
  | { type: "query"; step: number; query: string }
  /** One algorithm step finished. `branches` is a full snapshot of the branch tree. */
  | { type: "step-complete"; step: number; newQuads: number; branches: BranchSnapshot[] }
  /** A nested fetch completed. Contains the full event log and results of the nested execution. */
  | { type: "nested-fetch"; resourceIri: string; events: DebugEvent[]; results: OurQuad[]; stepCount: number }
  /** Graph detection result. `graph` is the IRI of the single detected graph, or null when multiple graphs are present. */
  | { type: "graph-detected"; graph: string | null };

function snapshotToString(snapshot: BranchSnapshot, indent = ""): string {
  const done = snapshot.done ? `✔ (${snapshot.done})` : "⏱";
  const list = snapshot.isList ? " LIST" : "";
  const line = `${done} ${snapshot.path}${list} ${snapshot.type.toUpperCase()}`;
  const children = snapshot.children
    .map((c) => snapshotToString(c, indent + "  "))
    .join("\n");
  return indent + line + (children ? "\n" + children : "");
}

export type QueryBindings = (query: string) => Promise<Bindings[]>

/**
 * ResourceFetcher class to fetch RDF resources with recursive branching.
 */
export class ResourceFetcher {
  #resourceIri: Quad_Subject;
  #recursionStepMultiplier: number;
  #queryBindings: QueryBindings;
  #sources: QuerySourceUnidentified[] = [];
  #emit?: (event: DebugEvent) => void;
  #shapesPointer?: Grapoi;
  #rootBranches: Branch[] = [];
  #maxNodeShapeDepth: number;
  #accumulatedDataset: DatasetCore<OurQuad>;
  #graph?: string;
  #pendingNestedFetches: Array<{ resourceIri: Quad_Subject; nodeShapePointer: Grapoi }> = [];
  #fetchedNestedIris: Set<string> = new Set();
  #nestedResults: OurQuad[] = [];
  #nestedSteps: number = 0;

  constructor({
    resourceIri,
    recursionStepMultiplier = 3,
    queryBindings,
    shapesPointer,
    debug,
    maxNodeShapeDepth = 2,
    graph,
  }: {
    resourceIri: Quad_Subject;
    recursionStepMultiplier?: number;
    queryBindings: QueryBindings;
    sources?: QuerySourceUnidentified[];
    shapesPointer?: Grapoi;
    debug?: boolean | ((event: DebugEvent) => void);
    maxNodeShapeDepth?: number;
    graph?: string;
  }) {
    this.#resourceIri = resourceIri;
    this.#recursionStepMultiplier = recursionStepMultiplier;
    this.#queryBindings = queryBindings;
    this.#shapesPointer = shapesPointer;
    this.#accumulatedDataset = datasetFactory.dataset<OurQuad>();
    if (debug) {
      if (typeof debug === "function") {
        this.#emit = debug;
      } else {
        // Shorthand: debug: true → pretty-print each event to the console
        this.#emit = (event: DebugEvent) => {
          if (event.type === "query") {
            console.info(`[query #${event.step}]\n${event.query}`);
          } else if (event.type === "step-complete") {
            const tree = event.branches
              .map((b) => snapshotToString(b))
              .join("\n");
            console.info(`[step ${event.step}] +${event.newQuads} quads\n${tree}\n`);
          } else if (event.type === "nested-fetch") {
            console.info(`[nested-fetch] ${event.resourceIri} (${event.stepCount} steps, ${event.results.length} quads)`);
          } else if (event.type === "graph-detected") {
            console.info(
              event.graph
                ? `[graph-detected] ${event.graph}`
                : "[graph-detected] multiple graphs"
            );
          }
        };
      }
    }
    this.#maxNodeShapeDepth = maxNodeShapeDepth;
    this.#graph = graph;
  }

  registerNestedFetch(resourceIri: Quad_Subject, nodeShapePointer: Grapoi) {
    if (this.#fetchedNestedIris.has(resourceIri.value)) return;
    this.#fetchedNestedIris.add(resourceIri.value);
    this.#pendingNestedFetches.push({ resourceIri, nodeShapePointer });
  }

  /**
   * Get the shapes pointer if provided.
   */
  get shapesPointer(): Grapoi | undefined {
    return this.#shapesPointer;
  }

  /**
   * Get the maximum sh:node recursion depth.
   */
  get maxNodeShapeDepth(): number {
    return this.#maxNodeShapeDepth;
  }

  /**
   * Get the resource IRI.
   */
  get resourceIri(): Quad_Subject {
    return this.#resourceIri;
  }

  /**
   * Get the recursion step multiplier.
   */
  get recursionStepMultiplier(): number {
    return this.#recursionStepMultiplier;
  }

  /**
   * Runs the algorithm to fetch the resource and its related data.
   */
  async execute(): Promise<{
    results: OurQuad[];
    steps: number;
  }> {
    // If no graph is specified, detect if the resource is in a single graph
    if (this.#graph !== undefined) {
      await this.#detectGraph();
    }

    let step = 1;
    const maxSteps = 80; // Safety limit

    let stepQuads = await this.#step1();
    // Accumulate quads from this step
    for (const quad of stepQuads) {
      this.#accumulatedDataset.add(quad);
    }
    this.#processStepResults(this.#accumulatedDataset, step);
    this.#emitStep(step, stepQuads.size);

    while (step < maxSteps && !this.#allBranchesDone()) {
      step++;
      stepQuads = await this.#nextStep(step);
      // Accumulate quads from this step
      for (const quad of stepQuads) {
        this.#accumulatedDataset.add(quad);
      }
      this.#processStepResults(this.#accumulatedDataset, step);
      this.#emitStep(step, stepQuads.size);
    }

    await this.#runPendingNestedFetches();

    return {
      results: [
        ...this.#rootBranches.flatMap((branch) =>
          branch.getResults([this.#resourceIri])
        ),
        ...this.#nestedResults,
      ],
      steps: step + this.#nestedSteps,
    };
  }

  #allBranchesDone(): boolean {
    return this.#rootBranches.every((branch) => branch.isDone());
  }

  #processStepResults(quads: DatasetCore, step: number) {
    for (const branch of this.#rootBranches) {
      branch.process(quads, step);
    }
  }

  #emitStep(step: number, newQuads: number) {
    this.#emit?.({
      type: "step-complete",
      step,
      newQuads,
      branches: this.#rootBranches.map((b) => b.toSnapshot()),
    });
  }

  async #runPendingNestedFetches() {
    while (this.#pendingNestedFetches.length > 0) {
      const batch = this.#pendingNestedFetches.splice(0);
      const batchResults = await Promise.all(
        batch.map(async ({ resourceIri, nodeShapePointer }) => {
          const nestedEvents: DebugEvent[] = [];
          const nestedFetcher = new ResourceFetcher({
            resourceIri,
            queryBindings: this.#queryBindings,
            sources: this.#sources,
            shapesPointer: nodeShapePointer,
            graph: this.#graph,
            maxNodeShapeDepth: this.#maxNodeShapeDepth,
            debug: (event) => nestedEvents.push(event),
          });
          const { results, steps } = await nestedFetcher.execute();
          this.#nestedSteps += steps;
          const stepCount = nestedEvents.filter((e) => e.type === "step-complete").length;
          this.#emit?.({
            type: "nested-fetch",
            resourceIri: resourceIri.value,
            events: nestedEvents,
            results,
            stepCount,
          });
          return results;
        })
      );
      this.#nestedResults.push(...batchResults.flat());
    }
  }

  async #step1() {
    // If a shape pointer is provided, extract root shape paths and create branches.
    if (this.#shapesPointer) {
      const properties = allShapeSubShapes(this.#shapesPointer)
        .out(sh("property"))
        .hasOut(sh("path"));
      const rootShapeBranches: Branch[] = properties.map(
        (propertyPointer: Grapoi) => {
          const path = parsePath(propertyPointer.out(sh("path")));
          const isList = !!propertyPointer.out(sh("memberShape")).term;

          return new Branch({
            path,
            depth: 1,
            isList,
            propertyPointer,
            resourceFetcher: this,
            type: "shape",
          });
        }
      );
      this.#rootBranches.push(...rootShapeBranches);
    }

    const initialQuery = this.#getInitialQuery();
    this.#emit?.({ type: "query", step: 1, query: initialQuery });

    const bindings = await this.#queryBindings!(initialQuery);

    const quads = numberedBindingsToQuads(bindings);
    // Lets create data branches for the first level.
    const firstLevelQuads = [...quads].filter(
      (quad) => quad.subject.value === this.#resourceIri.value
    );
    const firstLevelShapePredicates = this.#rootBranches.flatMap((branch) =>
      branch.getFirstPredicatesInPath()
    );

    const firstLevelDataPredicates = new Set(
      firstLevelQuads
        .map((quad) => quad.predicate.value)
        .filter(
          (predicate) =>
            !firstLevelShapePredicates.some(
              (shapePredicate) => shapePredicate.value === predicate
            )
        )
    );

    const rootDataBranches = [...firstLevelDataPredicates].map((predicate) => {
      const path: Path = [
        {
          predicates: [dataFactory.namedNode(predicate) as NamedNode],
          quantifier: "one",
          start: "subject",
          end: "object",
        },
      ];

      return new Branch({
        depth: 1,
        resourceFetcher: this,
        path,
        type: "data",
      });
    });

    this.#rootBranches.push(...rootDataBranches);
    return quads;
  }

  async #detectGraph() {
    const query = `SELECT DISTINCT ?g WHERE {
  GRAPH ?g {
    { <${this.#resourceIri.value}> ?p ?o }
    UNION
    { ?s ?p <${this.#resourceIri.value}> }
  }
} LIMIT 2`;

    this.#emit?.({ type: "query", step: 0, query });

    const bindings = await this.#queryBindings(
      query
    );

    if (bindings.length === 1) {
      const graphTerm = bindings[0].get("g");
      if (graphTerm && graphTerm.termType === "NamedNode") {
        this.#graph = graphTerm.value;
        this.#emit?.({ type: "graph-detected", graph: graphTerm.value });
      }
    } else if (bindings.length > 1) {
      this.#emit?.({ type: "graph-detected", graph: null });
    }
  }

  #getInitialQuery() {
    const queryPatterns = [
      // This pattern does the initial ?s ?p ?o for the resource IRI.
      { node_0: this.#resourceIri } as QueryPattern,
      // If there are shapes, get their patterns too.
      ...this.#rootBranches.flatMap((branch) => branch.toQueryPatterns()),
    ];
    return generateQuery(queryPatterns, this.#graph);
  }

  async #nextStep(step: number) {
    const queryPatterns = this.#rootBranches.flatMap((branch) =>
      branch.toQueryPatterns()
    );
    const query = generateQuery(queryPatterns, this.#graph);
    this.#emit?.({ type: "query", step, query });

    const bindings = await this.#queryBindings(query);
    return numberedBindingsToQuads(bindings);
  }
}

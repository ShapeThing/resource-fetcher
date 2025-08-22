import type { QueryEngine } from "npm:@comunica/query-sparql";
import type { QuerySourceUnidentified } from "npm:@comunica/types";
import factory from "npm:@rdfjs/data-model";
import datasetFactory from "npm:@rdfjs/dataset";
import namespace from "npm:@rdfjs/namespace";
import type { Dataset, NamedNode, Quad_Subject } from "npm:@rdfjs/types";
import grapoi from "npm:grapoi";
import type Grapoi from "./Grapoi.ts";
import { allShapeProperties } from "./helpers/allShapeProperties.ts";
import { branchToMermaid } from "./helpers/branchToMermaid.ts";
import parsePath, { PathSegment } from "./helpers/parsePath.ts";

export const sh = namespace("http://www.w3.org/ns/shacl#");

type Options = {
  subject: Quad_Subject;
  engine: QueryEngine;
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  shapesPointer?: Grapoi;
  debug?: true;
};

export type Branch = {
  pathSegment: PathSegment;
  children: Branch[];
  depth: number;
  parent?: Branch;
  processed?: boolean;
};

export class ResourceFetcher {
  public subject: Quad_Subject;
  #engine: QueryEngine;
  #branches: Branch[] = [];
  #sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]];
  #shapesPointer?: Grapoi;
  #store: Dataset = datasetFactory.dataset();
  #pointer: Grapoi;
  #latestQuery: string = "";

  constructor(options: Options) {
    this.subject = options.subject;
    this.#engine = options.engine;
    this.#sources = options.sources;
    this.#shapesPointer = options.shapesPointer;
    this.#pointer = grapoi({
      dataset: this.#store,
      factory,
      term: this.subject,
    });
  }

  get #engineOptions() {
    return {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: "http://example.org/",
    };
  }

  async *execute() {
    await this.#initialFetch();
    yield {
      mermaid: this.toMermaid(),
      query: this.#latestQuery,
    };
  }

  async executeQuery(query: string) {
    const response = await this.#engine.queryQuads(query, this.#engineOptions);
    this.#latestQuery = query;
    return await response.toArray();
  }

  async #initialFetch() {
    const initialQuery = `CONSTRUCT { ?s ?p ?o } WHERE {
        GRAPH ?g {
          VALUES ?s { <${this.subject.value}> }
          ?s ?p ?o
        }
      }`;
    const quads = await this.executeQuery(initialQuery);

    const quadBranches = quads.map((quad) => ({
      pathSegment: [
        {
          predicates: [quad.predicate as NamedNode],
          start: "subject" as const,
          end: "object" as const,
          quantifier: "one" as const,
        },
      ],
      children: [],
      depth: 0,
    }));

    const shapeBranches = this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer)
          .out(sh("path"))
          // Filter out property paths that are already covered by the quad branches
          // It matches only exactly on the case: sh:path the:predicate
          .filter(
            (pointer) =>
              !quads.some((quad) => quad.predicate.equals(pointer.term))
          )
          .map((pathPointer: Grapoi) => ({
            pathSegment: parsePath(pathPointer),
            children: [],
            depth: 0,
          }))
      : [];

    const temporaryPointer: Grapoi = grapoi({
      dataset: datasetFactory.dataset(quads),
      factory,
      term: this.subject,
    });

    this.#branches = [...quadBranches, ...shapeBranches];
    for (const branch of this.#branches) {
      const branchLeafTerms = temporaryPointer.executeAll(
        branch.pathSegment
      ).terms;
      console.log(branchLeafTerms);
    }
  }

  toMermaid() {
    let chart = `---\nconfig:\n  layout: dagre\n---\nflowchart LR\n\n`;
    chart += this.#branches
      .map((branch) =>
        branchToMermaid(branch, this.#pointer, this.subject.value)
      )
      .join("");
    return chart;
  }
}

import { Quad, Quad_Subject } from "@rdfjs/types";
import { Path } from "./core/parsePath.ts";
import { ResourceFetcher } from "./ResourceFetcher.ts";
import { cartesianProduct } from "./helpers/cartesianProduct.ts";

type QueryPattern = Record<string, Quad_Subject>;

export class Branch {
  #done: boolean = false;
  #results: Quad[] = [];
  #path: Path = [];
  #depth: number;
  #children: Branch[] = [];
  #parent?: Branch;
  #resourceFetcher: ResourceFetcher;
  #queryCounter: number;

  constructor({
    depth,
    parent,
    resourceFetcher,
    path,
    queryCounter,
  }: {
    depth: number;
    parent?: Branch;
    resourceFetcher: ResourceFetcher;
    path: Path;
    queryCounter?: number;
  }) {
    this.#depth = depth;
    this.#parent = parent;
    this.#resourceFetcher = resourceFetcher;
    this.#path = path;
    this.#queryCounter = queryCounter ?? 0;
  }

  get depth(): number {
    return this.#depth;
  }

  get root(): Branch {
    let branch: Branch = this;
    while (branch.#parent) branch = branch.#parent;
    return branch;
  }

  /**
   * Returns the IRIs of the shapes that target this branch.
   */
  matchTargets(): Quad[] {
    return [];
  }

  createChildBranches() {}

  toQueryPatterns(): QueryPattern[] {
    const node_0 = this.#resourceFetcher.resourceIri;

    // Expand segments with zeroOrMore quantifier
    const expandedPaths: Path[] = [];
    const hasZeroOrMore = this.#path.some(
      (segment) => segment.quantifier === "zeroOrMore"
    );

    if (hasZeroOrMore) {
      const maxRepetitions = (this.#queryCounter + 1) * 3;

      // Generate paths with different repetition counts
      for (let repetitions = 1; repetitions <= maxRepetitions; repetitions++) {
        const expandedPath: Path = [];

        for (const segment of this.#path) {
          if (segment.quantifier === "zeroOrMore") {
            // Repeat the segment based on current repetition count
            for (let i = 0; i < repetitions; i++) {
              expandedPath.push({
                ...segment,
                quantifier: "one",
              });
            }
          } else {
            expandedPath.push(segment);
          }
        }

        expandedPaths.push(expandedPath);
      }
    } else {
      expandedPaths.push(this.#path);
    }

    // Generate patterns for each expanded path
    const allPatterns: QueryPattern[] = [];

    for (const path of expandedPaths) {
      // Get all predicate arrays from each path segment
      const predicateArrays = path.map((segment) => segment.predicates);
      const combinations = cartesianProduct(predicateArrays);

      // Build query patterns for each combination
      const patterns = combinations.map((predicates) => {
        const pattern: QueryPattern = { node_0 };
        predicates.forEach((predicate, index) => {
          const segment = path[index];
          const prefix =
            segment.start === "object" ? "reverse_predicate" : "predicate";
          pattern[`${prefix}_${index + 1}`] = predicate;
        });
        return pattern;
      });

      allPatterns.push(...patterns);
    }

    return allPatterns;
  }
}

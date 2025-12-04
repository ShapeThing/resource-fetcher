import { Quad, Quad_Subject } from "@rdfjs/types";
import { Path } from "./parsePath.ts";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import { cartesianProduct } from "../helpers/cartesianProduct.ts";
import { throws } from "node:assert";

export type QueryPattern = Record<string, Quad_Subject>;

type BranchOptions = {
  depth: number;
  parent?: Branch;
  resourceFetcher: ResourceFetcher;
  path: Path;
  queryCounter?: number;
  children?: Branch[];
};

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
    children,
  }: BranchOptions) {
    this.#depth = depth;
    this.#parent = parent;
    this.#resourceFetcher = resourceFetcher;
    this.#path = path;
    this.#queryCounter = queryCounter ?? 0;
    this.#children = children ?? [];
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

  #getLeafBranches(): Branch[] {
    if (this.#children.length === 0) {
      return [this];
    }
    return this.#children.flatMap((child) => child.#getLeafBranches());
  }

  getFirstPredicateInPath(): Quad_Subject[] {
    return this.#path[0].predicates
  }

  #getPathToRoot(): Path {
    const pathSegments: Path = [...this.#path];
    let current: Branch | undefined = this.#parent;

    while (current) {
      pathSegments.unshift(...current.#path);
      current = current.#parent;
    }

    return pathSegments;
  }

  #expandPathWithQuantifiers(path: Path): Path[] {
    // Find first segment with special quantifier
    const specialIndex = path.findIndex(
      (s) =>
        s.quantifier === "oneOrMore" ||
        s.quantifier === "zeroOrMore" ||
        s.quantifier === "zeroOrOne"
    );

    // Base case: no more special quantifiers
    if (specialIndex === -1) {
      return [path];
    }

    const segment = path[specialIndex];
    const beforeSegment = path.slice(0, specialIndex);
    const afterSegment = path.slice(specialIndex + 1);
    const expandedPaths: Path[] = [];

    if (
      segment.quantifier === "oneOrMore" ||
      segment.quantifier === "zeroOrMore"
    ) {
      const maxRepetitions =
        (this.#queryCounter + 1) *
        this.#resourceFetcher.recursionStepMultiplier;
      const minRepetitions = segment.quantifier === "zeroOrMore" ? 0 : 1;

      for (
        let repetitions = minRepetitions;
        repetitions <= maxRepetitions;
        repetitions++
      ) {
        const repeated: Path = [];
        for (let i = 0; i < repetitions; i++) {
          repeated.push({ ...segment, quantifier: "one" });
        }
        const newPath = [...beforeSegment, ...repeated, ...afterSegment];
        // Recursively expand remaining special quantifiers
        expandedPaths.push(...this.#expandPathWithQuantifiers(newPath));
      }
    } else if (segment.quantifier === "zeroOrOne") {
      // Exclude the segment (0 repetitions)
      const pathWithoutSegment = [...beforeSegment, ...afterSegment];
      expandedPaths.push(
        ...this.#expandPathWithQuantifiers(pathWithoutSegment)
      );

      // Include the segment (1 repetition)
      const pathWithSegment = [
        ...beforeSegment,
        { ...segment, quantifier: "one" as const },
        ...afterSegment,
      ];
      expandedPaths.push(...this.#expandPathWithQuantifiers(pathWithSegment));
    }

    return expandedPaths;
  }

  #buildPatternFromPath(path: Path): QueryPattern[] {
    const node_0 = this.#resourceFetcher.resourceIri;
    const predicateArrays = path.map((segment) => segment.predicates);
    const combinations = cartesianProduct(predicateArrays);

    return combinations.map((predicates) => {
      const pattern: QueryPattern = { node_0 };
      predicates.forEach((predicate, index) => {
        const segment = path[index];
        const prefix =
          segment.start === "object" ? "reverse_predicate" : "predicate";
        pattern[`${prefix}_${index + 1}`] = predicate;
      });
      return pattern;
    });
  }

  toQueryPatterns(): QueryPattern[] {
    // If this branch has children, get patterns from all leaf branches
    if (this.#children.length > 0) {
      const leafBranches = this.#getLeafBranches();
      const allPatterns: QueryPattern[] = [];

      for (const leaf of leafBranches) {
        const pathToRoot = leaf.#getPathToRoot();
        const expandedPaths = this.#expandPathWithQuantifiers(pathToRoot);

        for (const path of expandedPaths) {
          allPatterns.push(...this.#buildPatternFromPath(path));
        }
      }

      return allPatterns;
    }

    // No children, process this branch's path
    const expandedPaths = this.#expandPathWithQuantifiers(this.#path);

    const allPatterns: QueryPattern[] = [];
    for (const path of expandedPaths) {
      allPatterns.push(...this.#buildPatternFromPath(path));
    }

    return allPatterns;
  }

  createChildForTestingPurposes(child: BranchOptions) {
    const newChild = new Branch({
      ...child,
      parent: this,
    });
    this.#children.push(newChild);
    return newChild;
  }

  get children(): Branch[] {
    return this.#children;
  }
}

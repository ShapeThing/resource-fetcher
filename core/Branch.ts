import { DatasetCore, NamedNode, Quad, Quad_Subject } from "@rdfjs/types";
import parsePath, { Path } from "./parsePath.ts";
import { ResourceFetcher } from "../ResourceFetcher.ts";
import { cartesianProduct } from "../helpers/cartesianProduct.ts";
import grapoi from "grapoi";
import Grapoi from "../helpers/Grapoi.ts";
import dataFactory from "@rdfjs/data-model";
import { context } from "../helpers/context.ts";
import { allShapeSubShapes } from "../helpers/allShapeSubShapes.ts";
import { sh } from "../helpers/namespaces.ts";
import datasetFactory from "@rdfjs/dataset";

export type QueryPattern = Record<string, Quad_Subject>;

type BranchOptions = {
  depth: number;
  parent?: Branch;
  resourceFetcher: ResourceFetcher;
  path: Path;
  propertyPointer?: Grapoi;
  type: "data" | "shape";
  queryCounter?: number;
  children?: Branch[];
};

export type StepResults = {
  step: number;
  quads: Quad[];
};

const NO_RESULTS = "no-results";
const NO_BLANK_NODES = "no-blank-nodes";
const SAME_CONSECUTIVE_RESULT = "same-consecutive-result";
const ALL_CHILDREN_DONE = "all-children-done";

export class Branch {
  #done:
    | false
    | typeof NO_RESULTS
    | typeof NO_BLANK_NODES
    | typeof ALL_CHILDREN_DONE
    | typeof SAME_CONSECUTIVE_RESULT = false;
  #results: StepResults[] = [];
  #path: Path = [];
  #depth: number;
  #children: Branch[] = [];
  #parent?: Branch;
  #resourceFetcher: ResourceFetcher;
  #queryCounter: number;
  #type: "data" | "shape";
  #propertyPointer?: Grapoi;

  constructor({
    depth,
    parent,
    resourceFetcher,
    path,
    queryCounter,
    children,
    propertyPointer,
    type,
  }: BranchOptions) {
    this.#depth = depth;
    this.#parent = parent;
    this.#resourceFetcher = resourceFetcher;
    this.#path = path;
    this.#queryCounter = queryCounter ?? 0;
    this.#type = type;
    this.#children = children ?? [];
    this.#propertyPointer = propertyPointer;
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

  createChildBranchesByDataPredicates(quads: Quad[]) {
    // CBD expansion for blank nodes, only unique ones are ultimately added.
    const predicates = new Set<string>();

    // Get all blank node objects for CBD expansion
    const blankNodes = quads
      .filter((q) => q.object.termType === "BlankNode")
      .map((q) => q.object);

    // For each blank node, find its outgoing predicates in the dataset
    for (const blankNode of blankNodes) {
      const blankNodeQuads = quads.filter(
        (q) => q.subject.value === blankNode.value
      );

      for (const quad of blankNodeQuads) {
        predicates.add(quad.predicate.value);
      }
    }

    const filteredPredicates = [...predicates].filter((predicate) => {
      const childStartsWithSamePredicate = this.#children.some((child) => {
        const firstPredicates = child.getFirstPredicatesInPath();
        return firstPredicates.some((p) => p.value === predicate);
      });
      return !childStartsWithSamePredicate;
    });

    const dataBranches = [...filteredPredicates].map((predicate) => {
      const path: Path = [
        {
          predicates: [dataFactory.namedNode(predicate)],
          quantifier: "one",
          start: "subject",
          end: "object",
        },
      ];

      return new Branch({
        depth: this.#depth + 1,
        resourceFetcher: this.#resourceFetcher,
        path,
        parent: this,
        type: "data",
      });
    });

    this.#children.push(...dataBranches);
    return dataBranches;
  }

  createChildBranchesByPropertyPointer() {
    const shaclPropertiesToFollow = this.#propertyPointer
      ? allShapeSubShapes(this.#propertyPointer).out(sh("property"))
      : null;

    const shapeBranches = (shaclPropertiesToFollow ?? []).map(
      (propertyPointer: Grapoi) => {
        const path = parsePath(propertyPointer.out(sh("path")));
        return new Branch({
          path,
          depth: this.#depth + 1,
          propertyPointer,
          resourceFetcher: this.#resourceFetcher,
          parent: this,
          type: "shape",
        });
      }
    );

    for (const branch of shapeBranches) {
      const identity = JSON.stringify(branch.#path);
      const identityExistsAsChild = this.children
        .map((child) => JSON.stringify(child.#path))
        .find((otherIdentity) => otherIdentity === identity);
      if (!identityExistsAsChild) {
        this.#children.push(branch);
      }
    }
  }

  getLeafBranches(): Branch[] {
    if (this.#children.length === 0) return [this];
    return this.#children.flatMap((child) => child.getLeafBranches());
  }

  getFirstPredicatesInPath(): Quad_Subject[] {
    return this.#path[0].predicates;
  }

  isDone(): boolean {
    return this.#done !== false;
  }

  getPathToRoot(includeSelf: boolean = true): Path {
    const pathSegments: Path = includeSelf ? [...this.#path] : [];
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
      const leafBranches = this.getLeafBranches();
      const allPatterns: QueryPattern[] = [];

      for (const leaf of leafBranches) {
        if (leaf.#done) continue;
        const pathToRoot = leaf.getPathToRoot();
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

  get children(): Branch[] {
    return this.#children;
  }

  get done () {
    return !!this.#done
  }

  process(dataset: DatasetCore, step: number) {
    const dataPointer: Grapoi = grapoi({ factory: dataFactory, dataset });
    const parentsPath = this.getPathToRoot(false);
    const parentPointer = dataPointer.executeAll(parentsPath).distinct();
    const thisBranchDataPointer = parentPointer.executeAll(this.#path);
    const quads = [
      // Quads from the current branch.
      ...thisBranchDataPointer.quads(),
      // Quads from the over fetch.
      ...thisBranchDataPointer.out().quads(),
    ];
    this.#results.push({ step, quads });

    // Create branches for further property shapes
    this.createChildBranchesByPropertyPointer();

    // CBD expansion for blank nodes, only unique ones are ultimately added.
    this.createChildBranchesByDataPredicates(quads);

    // Mark as done if no quads found
    if (!quads.length) {
      this.#done = NO_RESULTS;
      return;
    }

    const blankNodes = quads
      .filter((q) => q.object.termType === "BlankNode")
      .map((q) => q.object);

    const hasNoBlankNodes =
      blankNodes.length === 0 && this.#children.length === 0;

    // Check for shaped resources (named nodes that have sh:node shapes)
    // For now, if no blank nodes and no children created, mark as done
    if (hasNoBlankNodes) {
      this.#done = NO_BLANK_NODES;
      return;
    }
    // If predicates.size === 0, we have blank nodes but don't know their predicates yet
    // Don't mark as done - wait for next step to fetch that data

    // Process children AFTER creating them
    for (const child of this.#children) {
      child.process(dataset, step);
    }

    // Mark as done if all children are done
    if (
      this.#children.every((child) => child.#done)
    ) {
      this.#done = ALL_CHILDREN_DONE;
    }



    // Detect if we're stuck (same results for 3 consecutive steps)
    if (this.#results.length >= 3 && !this.#done) {
      const lastSteps = this.#results.slice(-3);
      const allSameLength = lastSteps.every(
        (r) => r.quads.length === lastSteps[0].quads.length
      );
      if (allSameLength && lastSteps[0].quads.length > 0) {
        this.#done = SAME_CONSECUTIVE_RESULT;
      }
    }
  }

  getResults(subjects: Quad_Subject[]): Quad[] {
    const branchDataPointer = grapoi({
      factory: dataFactory,
      dataset: datasetFactory.dataset(this.#results.at(-1)?.quads),
      terms: subjects,
    });
    const myQuads = [...branchDataPointer.executeAll(this.#path).quads()];
    const nextSubjects = myQuads
      .map((q) => (q.termType !== "Literal" ? q.object : undefined))
      .filter(Boolean);
    const childQuads = this.#children.flatMap((child) =>
      child.getResults(nextSubjects)
    );
    return [...myQuads, ...childQuads];
  }

  debug(): string {
    const path = this.#path
      .map((segment) =>
        segment.predicates.map((p) => context.compactIri(p.value)).join(" | ")
      )
      .join(" / ");

    const childrenDebug = this.#children
      .map((child) => {
        const childLines = child.debug().split("\n");
        return childLines.map((line) => "  " + line).join("\n");
      })
      .join("\n");

    return `${this.#done ? "✔" : "⏱"} ${path} ${this.#type.toUpperCase()} ${this.#done ? `(${this.#done})` : ""}${childrenDebug ? "\n" + childrenDebug : ""}`;
  }
}

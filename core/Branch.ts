import { DatasetCore, Quad, Quad_Subject, Term } from "@rdfjs/types";
import parsePath, { Path } from "./parsePath.ts";
import { OurQuad, ResourceFetcher } from "../ResourceFetcher.ts";
import { cartesianProduct } from "../helpers/cartesianProduct.ts";
import grapoi from "grapoi";
import Grapoi from "../helpers/Grapoi.ts";
import dataFactory from "@rdfjs/data-model";
import { context } from "../helpers/context.ts";
import { allShapeSubShapes } from "../helpers/allShapeSubShapes.ts";
import { rdf, sh } from "../helpers/namespaces.ts";
import datasetFactory from "@rdfjs/dataset";
import { getListQuadsFromPointer } from "../helpers/getListQuadsFromPointer.ts";
import { getFocusNodes } from "./getFocusNodes.ts";

export type QueryPattern = Record<string, Quad_Subject>;

type BranchOptions = {
  depth: number;
  parent?: Branch;
  isList?: boolean;
  resourceFetcher: ResourceFetcher;
  path: Path;
  propertyPointer?: Grapoi;
  type: "data" | "shape";
  queryCounter?: number;
  children?: Branch[];
  isListMemberChild?: boolean;
};

export type StepResults = {
  step: number;
  quads: Quad[];
};

const NO_RESULTS = "no-results";
const NO_BLANK_NODES = "no-blank-nodes";
const SAME_CONSECUTIVE_RESULT = "same-consecutive-result";
const ALL_CHILDREN_DONE = "all-children-done";
const NO_CHILDREN = "no-children";
const FINISHED_MORE = "finished-more";

export class Branch {
  #done:
    | false
    | typeof NO_RESULTS
    | typeof NO_BLANK_NODES
    | typeof NO_CHILDREN
    | typeof ALL_CHILDREN_DONE
    | typeof FINISHED_MORE
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
  #isList: boolean = false;
  #isListMemberChild: boolean = false;

  constructor({
    depth,
    parent,
    resourceFetcher,
    path,
    queryCounter,
    children,
    propertyPointer,
    isList = false,
    isListMemberChild = false,
    type,
  }: BranchOptions) {
    this.#depth = depth;
    this.#parent = parent;
    this.#resourceFetcher = resourceFetcher;
    this.#path = path;
    this.#queryCounter = queryCounter ?? 0;
    this.#type = type;
    this.#isList = isList;
    this.#isListMemberChild = isListMemberChild;
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

  createChildBranchesByMemberShape() {
    if (!this.#isList || !this.#propertyPointer) return;

    const listProperties = allShapeSubShapes(
      this.#propertyPointer.out(sh("memberShape"))
    )
      .out(sh("property"))
      .hasOut(sh("path"));

    const listBranches = listProperties.map((propertyPointer: Grapoi) => {
      const path = parsePath(propertyPointer.out(sh("path")));

      return new Branch({
        depth: this.#depth + 1,
        resourceFetcher: this.#resourceFetcher,
        path,
        parent: this,
        type: "shape",
        propertyPointer,
        isListMemberChild: true,
      });
    });

    for (const branch of listBranches) {
      const identity = JSON.stringify(branch.#path);
      const identityExistsAsChild = this.children
        .map((child) => JSON.stringify(child.#path))
        .find((otherIdentity) => otherIdentity === identity);
      if (!identityExistsAsChild) {
        this.#children.push(branch);
      }
    }
  }

  // TODO in this function we will try to match the new quads against the given shapes given for "further matching".
  // We must be careful here not to have recursion, not to fetch a whole family tree when we are fetching one person.
  // and all kinds of other problems.
  // https://w3c.github.io/data-shapes/shacl12-core/#targets these are the targets we can implement.
  createChildBranchesByNewMatches(quads: OurQuad[]) {
    if (!this.#resourceFetcher.furtherShapes) return;

    const leafQuads = quads.filter((q) => q.isLeaf);
    const leafSubjects = new Map(
      leafQuads.map((q) => [q.subject.value, q.subject])
    );

    const dataPointer = grapoi({
      dataset: datasetFactory.dataset(quads),
      factory: dataFactory,
      terms: [...leafSubjects.values()],
    });

    const shapesPointer = grapoi({
      dataset: this.#resourceFetcher.furtherShapes,
      factory: dataFactory,
    });

    const matches = getFocusNodes(shapesPointer, dataPointer);

    for (const match of matches) {
      const shaclPropertiesToFollow = allShapeSubShapes(match.shapes)
        .out(sh("property"))
        .hasOut(sh("path"));

      const shapeBranches = shaclPropertiesToFollow.map(
        (propertyPointer: Grapoi) => {
          const path = parsePath(propertyPointer.out(sh("path")));

          const isList = !!propertyPointer.out(sh("memberShape")).term;

          return new Branch({
            path,
            depth: this.#depth + 1,
            propertyPointer,
            isList,
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
  }

  createChildBranchesByDataQuads(quads: Quad[]) {
    if (
      this.#path.some(
        (segment) =>
          segment.quantifier === "oneOrMore" ||
          segment.quantifier === "zeroOrMore"
      )
    ) {
      return [];
    }

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
      // Skip rdf:first and rdf:rest if this is a list branch - they're handled by list expansion
      if (
        this.#isList &&
        (predicate === rdf("first").value || predicate === rdf("rest").value)
      ) {
        return false;
      }

      // For LIST branches, skip if predicate is already in this branch's path
      // This is because list branches handle their predicates via list expansion,
      // so we don't need child branches for them
      if (this.#isList) {
        const predicateInCurrentPath = this.#path.some((segment) =>
          segment.predicates.some((p) => p.value === predicate)
        );
        if (predicateInCurrentPath) {
          return false;
        }
      }

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
      ? allShapeSubShapes(this.#propertyPointer)
          .out(sh("property"))
          .hasOut(sh("path"))
      : null;

    const shapeBranches = [...(shaclPropertiesToFollow ?? [])].map(
      (propertyPointer: Grapoi) => {
        const path = parsePath(propertyPointer.out(sh("path")));

        const isList = !!propertyPointer.out(sh("memberShape")).term;

        return new Branch({
          path,
          depth: this.#depth + 1,
          propertyPointer,
          isList,
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

    // If this is a list member child, don't include the list parent's path
    // because list members are traversed directly, not through the list path
    if (this.#isListMemberChild) {
      return pathSegments;
    }

    let current: Branch | undefined = this.#parent;

    while (current) {
      // Stop if we reach a list parent, as list member children don't traverse through it
      if (current.#isList) {
        break;
      }
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
        const isLastSegment = index === path.length - 1;
        pattern[
          `${prefix}_${this.#isList && isLastSegment ? "isList_" : ""}${index + 1}`
        ] = predicate;
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
        // Use the leaf's queryCounter for expansion (important for recursive quantifiers)
        const expandedPaths = leaf.#expandPathWithQuantifiers(pathToRoot);

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

  get done() {
    return !!this.#done;
  }

  process(dataset: DatasetCore, step: number) {
    const dataPointer: Grapoi = grapoi({ factory: dataFactory, dataset });
    const parentsPath = this.getPathToRoot(false);
    const parentPointer = dataPointer.executeAll(parentsPath).distinct();
    const thisBranchDataPointer = parentPointer.executeAll(this.#path);
    const pathQuads = [...thisBranchDataPointer.quads()];
    const overFetchQuads = [...thisBranchDataPointer.out().quads()];

    const listQuads = getListQuadsFromPointer(thisBranchDataPointer);

    if (listQuads.length) {
      const valueQuads = listQuads.filter((q) =>
        q.predicate.equals(rdf("first"))
      );
      if (valueQuads.length) this.createChildBranchesByMemberShape();
    }

    const quads = [
      // Quads from the current branch.
      ...pathQuads,
      // Quads from the over fetch.
      ...overFetchQuads,
      // Quads from the list expansion (if any).
      ...listQuads,
    ];
    this.#results.push({ step, quads });

    // Create branches for further property shapes
    this.createChildBranchesByPropertyPointer();

    this.createChildBranchesByNewMatches(quads);

    // CBD expansion for blank nodes, only unique ones are ultimately added.
    this.createChildBranchesByDataQuads(quads);

    // Process children AFTER creating them
    for (const child of this.#children) {
      child.process(dataset, step);
    }

    // For branches with recursive quantifiers (zeroOrMore, oneOrMore),
    // check if we need to continue fetching more data
    if (
      this.#path.some(
        (segment) =>
          segment.quantifier === "oneOrMore" ||
          segment.quantifier === "zeroOrMore"
      )
    ) {
      let pointer = parentPointer;
      for (const pathSegment of this.#path) {
        pointer = pointer.execute(pathSegment);
        if (
          pathSegment.quantifier === "oneOrMore" ||
          pathSegment.quantifier === "zeroOrMore"
        ) {
          const finished =
            this.#results.length > 1 &&
            this.#results.at(-1)!.quads.length ===
              this.#results.at(-2)!.quads.length;

          // Don't mark as finished if we have children that haven't been processed yet
          // This handles cases like rdf:nil where we need to traverse from named nodes
          const hasUnprocessedChildren = this.#children.some(
            (child) => child.#results.length === 0
          );

          if (finished && !hasUnprocessedChildren) {
            this.#done = FINISHED_MORE;
            return;
          } else {
            this.#queryCounter = this.#queryCounter + 1;
            return;
          }
        }
      }
    }

    // Mark as done if no quads found
    // For SHAPE branches with depth > 2, wait at least one more step because
    // deeply nested blank node data might not have been fetched yet
    // For DATA branches or shallow SHAPE branches, mark as done immediately
    if (!quads.length) {
      if (this.#type === "data" || this.#depth <= 2 || step > 1) {
        this.#done = NO_RESULTS;
      }
      return;
    }

    // Only check for blank nodes in the path quads, not the over-fetch
    const blankNodes = pathQuads
      .filter((q) => q.object.termType === "BlankNode")
      .map((q) => q.object);

    // For LIST branches, blank nodes are handled by list expansion via listQuads
    // So we can treat them as if there are no blank nodes for completion logic
    const effectiveBlankNodes = this.#isList ? [] : blankNodes;

    // Don't mark as done if we have children (even if no blank nodes)
    // The children might need to traverse from named nodes (e.g., rdf:nil in lists)
    const hasNoBlankNodesAndNoChildren =
      effectiveBlankNodes.length === 0 && this.#children.length === 0;

    if (hasNoBlankNodesAndNoChildren) {
      this.#done = NO_BLANK_NODES;
      return;
    }

    // Mark as done if all children are done
    // BUT only if we have children OR if we have no blank nodes
    // (if we have blank nodes but no children, we need another step to fetch their data)
    if (
      this.#children.length > 0 &&
      this.#children.every((child) => child.#done)
    ) {
      this.#done = ALL_CHILDREN_DONE;
      return;
    }

    // If we have no children but we have blank nodes, don't mark as done yet
    // We need another step to fetch the blank node data
    if (!this.#children.length && effectiveBlankNodes.length === 0) {
      this.#done = NO_CHILDREN;
      return;
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
    // TODO this might give some cruft, lets check if we can improve it at a later time.
    const dataset = datasetFactory.dataset(
      this.#results.flatMap((stepResults) => stepResults.quads)
    );
    const branchDataPointer = grapoi({
      factory: dataFactory,
      dataset,
      terms: subjects,
    });
    const myQuads = [...branchDataPointer.executeAll(this.#path).quads()];
    const listQuads = getListQuadsFromPointer(
      branchDataPointer.executeAll(this.#path)
    );

    const nextSubjects = [...myQuads, ...listQuads]
      .map((q) => (q.object.termType !== "Literal" ? q.object : undefined))
      .filter(Boolean);

    const childQuads = this.#children.flatMap((child) =>
      child.getResults(nextSubjects)
    );

    return [...myQuads, ...childQuads, ...listQuads];
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

    return `${this.#done ? "✔" : "⏱"} ${path} ${this.#isList ? "LIST" : ""} ${this.#type.toUpperCase()} ${this.#done ? `(${this.#done})` : ""}${childrenDebug ? "\n" + childrenDebug : ""}`;
  }
}

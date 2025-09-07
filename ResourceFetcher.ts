import type { QueryEngine } from 'npm:@comunica/query-sparql'
import type { QuerySourceUnidentified } from 'npm:@comunica/types'
import factory from 'npm:@rdfjs/data-model'
import datasetFactory from 'npm:@rdfjs/dataset'
import type { Quad, Quad_Subject } from 'npm:@rdfjs/types'
import grapoi from 'npm:grapoi'
import { addDataBranches } from './core/addDataBranches.ts'
import { createShapeBranches } from './core/addShapeBranches.ts'
import { Branch } from './core/Branch.ts'
import { generateQuery } from './core/generateQuery.ts'
import { numberedBindingsToQuads } from './core/numberedBindingsToQuads.ts'
import { getBranchParents } from './helpers/getBranchParents.ts'
import { getLeafBranches } from './helpers/getLeafBranches.ts'
import type Grapoi from './helpers/Grapoi.ts'
import { queryPrefixes } from './helpers/namespaces.ts'
import { toMermaid } from './helpers/toMermaid.ts'

export type Options = {
  subject: Quad_Subject
  engine: QueryEngine
  sources: Sources
  shapesPointer?: Grapoi
  debug?: true
}

export type Sources = [QuerySourceUnidentified, ...QuerySourceUnidentified[]]
export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean }

export class ResourceFetcher {
  subject: Quad_Subject
  #engine: QueryEngine
  #branches: Branch[] = []
  #sources: Sources
  #shapesPointer?: Grapoi
  #debug: boolean

  constructor(options: Options) {
    this.subject = options.subject
    this.#engine = options.engine
    this.#sources = options.sources
    this.#shapesPointer = options.shapesPointer
    this.#debug = options.debug || false
  }

  get #engineOptions() {
    return {
      sources: this.#sources,
      unionDefaultGraph: true,
      baseIRI: 'http://example.org/',
    }
  }

  /**
   * The heart beat of the algorithm.
   */
  async *execute(): AsyncGenerator<{
    mermaid: string
    query: string
  }> {
    if (this.#shapesPointer) this.#branches.push(...createShapeBranches(this.#shapesPointer))
    yield { mermaid: toMermaid(this.subject, this.#branches), query: '' }
    yield await this.#executeStep(1)
    // yield await this.#executeStep(2)
  }

  /**
   * Execute a query and parses the bindings to Quads.
   * By using a select query we can potentially add to the Quads if it is a leaf or not.
   *
   * The convention of the variables are (reverse_)anything_[number]
   */
  async executeQuery(query: string): Promise<OurQuad[]> {
    const response = await this.#engine.queryBindings(
      `${queryPrefixes}\n${query}`,
      this.#engineOptions,
    )
    const bindings = await response.toArray()
    return numberedBindingsToQuads(bindings)
  }

  /**
   * One step in the algorithm
   */
  async #executeStep(depth: number): Promise<{ mermaid: string; query: string }> {
    const dataset = datasetFactory.dataset()
    const dataPointer = grapoi({ dataset, factory, term: this.subject })

    const query = generateQuery(this.subject, depth, this.#branches, this.#debug)
    const quads = await this.executeQuery(query)
    for (const quad of quads) dataset.add(quad)

    // Add new mainBranches for quads that came from the initial query.
    if (depth === 1) {
      addDataBranches(this.#branches, quads.filter((quad) => quad.isLeaf), this.#shapesPointer)
    }

    // Process the branches
    for (const mainBranch of this.#branches) {
      const leafBranches = getLeafBranches([mainBranch])
      for (const leafBranch of leafBranches) {
        const parents = getBranchParents(leafBranch)
        const path = parents.map((parent) => parent.pathSegment).flat()
        const mainBranchQuads = [...dataPointer.executeAll(path).quads()]

        // addDataBranches(leafBranch.children, quads.filter((quad) => quad.isLeaf))

        // console.log(mainBranchQuads)
      }
    }

    // const leafNodes = quads.filter((quad) => quad.isLeaf)
    // for (const leafBranch of getLeafBranches(this.#branches)) {
    //   const
    // }

    return {
      mermaid: toMermaid(this.subject, this.#branches, dataPointer),
      query,
    }
  }
}

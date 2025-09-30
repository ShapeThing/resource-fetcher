import datasetFactory from '@rdfjs/dataset'
import { QueryEngine } from '@comunica/query-sparql'
import type { DatasetCore, NamedNode, Quad } from '@rdfjs/types'
import grapoi from 'grapoi'
import { DataFactory } from 'rdf-data-factory'
import type Grapoi from './helpers/Grapoi'
import { generateQuery } from './core/generateQuery'
import type { Branch } from './core/Branch'
import { createShapeBranches } from './core/addShapeBranches'
import { numberedBindingsToQuads } from './core/numberedBindingsToQuads'
import { queryPrefixes, rdf, sh } from './helpers/namespaces'
import { allShapeProperties } from './helpers/allShapeProperties'
import parsePath from './helpers/parsePath'
import TermSet from '@rdfjs/term-set'
const factory = new DataFactory()

export type SourceType =
  | { type: 'sparql'; value: string }
  | {
      type: string
      value: string
      mediaType: string
      baseIRI: string
      filename?: string
    }
export type OurQuad = Quad & { isLeaf?: boolean; isReverse?: boolean }

export type Options = {
  subject: NamedNode
  sources: SourceType[]
  shapes?: SourceType | DatasetCore<OurQuad>
  engine: QueryEngine
  debug?: true
}

type internalOptions = Options & { shapesPointer?: Grapoi }

const GET_TRIPLES_QUERY = `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }`

export class ResourceFetcher {
  #options: Options
  #shapesPointer?: Grapoi
  #shapesStore: DatasetCore<OurQuad> = datasetFactory.dataset()
  #branches: Branch[] = []
  #flatBranches: Branch[] = []

  constructor(options: Options) {
    this.#options = options
    const internalOptions = options as internalOptions
    if (internalOptions.shapesPointer) {
      this.#shapesPointer = internalOptions.shapesPointer
    }
  }

  get #engineOptions() {
    return {
      sources: this.#options.sources,
      unionDefaultGraph: true,
      baseIRI: 'http://example.org/'
    }
  }

  async #processOptions() {
    // The full shapes pointer is always more important than the shapes dataset.
    if (!this.#shapesPointer && this.#options.shapes) {
      if ('type' in this.#options.shapes) {
        const { engine } = this.#options
        const shapeQuadsResponse = await engine.queryQuads(GET_TRIPLES_QUERY, {
          sources: [this.#options.shapes]
        })
        const quads = await shapeQuadsResponse.toArray()
        for (const quad of quads) {
          this.#shapesStore.add(quad)
        }
      } else {
        this.#shapesStore = this.#options.shapes
      }
    }
  }

  async *execute(): AsyncGenerator<StepResults> {
    await this.#processOptions()
    yield await this.executeStep(1)
    // After we have fetched the initial ?s ?p ?o we can determine the classes of the subject.
    if (this.#shapesPointer) this.#branches.push(...createShapeBranches(this.#shapesPointer))

    const getCurrentDepth = () =>
      this.#flatBranches.reduce((max, branch) => (branch.depth > max ? branch.depth : max), 0)

    let processedDepth = 1
    while (processedDepth <= getCurrentDepth()) {
      const nextDepth = processedDepth + 1
      yield await this.executeStep(nextDepth)
      processedDepth = nextDepth
    }
  }

  async executeStep(depth: number) {
    const query = generateQuery(this.#options.subject, depth, this.#branches, this.#options.debug)
    const results = await this.executeQuery(query)

    // Try to set the shape pointer if we have classes and no shape pointer yet.
    const classes = [...results.match(this.#options.subject, rdf('type'))].map(quad => quad.object)
    if (classes.length && !this.#shapesPointer && this.#options.shapes) {
      this.#shapesPointer = grapoi({ dataset: this.#shapesStore, factory })
        .hasOut(rdf('type'), sh('NodeShape'))
        .hasOut(sh('targetClass'), classes)
    }

    const dataPointer = grapoi({ dataset: results, factory, term: this.#options.subject })

    if (depth === 1) {
      this.#addDataBranches(
        { children: this.#branches, pathSegment: [], depth: 0 } as unknown as Branch,
        depth,
        dataPointer,
        this.#shapesPointer
      )
    } else {
      const leafBranches = this.#flatBranches.filter(branch => branch.depth === depth - 1)
      for (const leafBranch of leafBranches) {
        this.#addDataBranches(leafBranch, depth, dataPointer, this.#shapesPointer)
      }
    }

    return { query, dataset: results }
  }

  #addDataBranches(parent: Branch, depth: number, dataPointer: Grapoi, propertyPointer?: Grapoi) {
    const parentsPathSegments = []
    let currentParent: Branch | null = parent
    while (currentParent) {
      parentsPathSegments.unshift(...currentParent.pathSegment)
      currentParent = currentParent.parent
    }

    const cappedPathSegments = parentsPathSegments.slice(0, depth)
    const pointer = dataPointer.executeAll(cappedPathSegments)
    const leafQuads = [...pointer.distinct().out().quads()] as OurQuad[]

    console.log(leafQuads)

    const shapePredicates = propertyPointer
      ? allShapeProperties(propertyPointer)
          .out(sh('path'))
          .map((pathPointer: Grapoi) => {
            const path = parsePath(pathPointer)
            const predicates = path.flatMap(segment => segment.predicates)
            return predicates
          })
          .flat()
      : []

    const filteredQuads = leafQuads.filter(quad => !shapePredicates.some(predicate => quad.predicate.equals(predicate)))
    const uniquePredicates = new TermSet(filteredQuads.map(quad => quad.predicate))

    const quadBranches = [...uniquePredicates.values()].map(predicate => {
      const pathSegment = [
        {
          predicates: [predicate],
          start: 'subject' as const,
          end: 'object' as const,
          quantifier: 'one' as const
        }
      ]

      const quads = filteredQuads.filter(quad => quad.predicate.equals(predicate))
      const types = quads.filter(quad => quad.predicate.equals(rdf('type'))).map(quad => quad.object)
      const pathPropertyPointer =
        propertyPointer && types.length
          ? propertyPointer.node().hasOut(rdf('type'), sh('NodeShape')).hasOut(sh('targetClass'), types)
          : undefined

      return {
        pathSegment,
        depth: parent.depth + 1,
        parent,
        children: [],
        type: 'data',
        propertyPointer: pathPropertyPointer
      } satisfies Branch
    })

    // Also add it always to our flat index.
    this.#flatBranches.push(...quadBranches)
    // And add it to the actual tree.
    parent.children.push(...quadBranches)
  }

  /**
   * Execute a query and parses the bindings to Quads.
   * By using a select query we can potentially add to the Quads if it is a leaf or not.
   *
   * The convention of the variables are (reverse_)anything_[number]
   */
  async executeQuery(query: string): Promise<DatasetCore<OurQuad>> {
    const response = await this.#options.engine.queryBindings(`${queryPrefixes}\n${query}`, this.#engineOptions)
    const bindings = await response.toArray()
    return numberedBindingsToQuads(bindings)
  }
}

export type StepResults = {
  dataset: DatasetCore<OurQuad>
  query: string
}

// For local development so that tests always run after changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}

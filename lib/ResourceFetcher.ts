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

    if (this.#shapesPointer) this.#branches.push(...createShapeBranches(this.#shapesPointer))

    // console.log(this.#branches)

    yield await this.executeStep(1)
  }

  async executeStep(depth: number) {
    const dataset = datasetFactory.dataset()
    const query = generateQuery(this.#options.subject, depth, this.#branches, this.#options.debug)
    const quads = await this.executeQuery(query)
    for (const quad of quads) dataset.add(quad)

    const classes = [...quads.match(this.#options.subject, rdf('type'))].map(quad => quad.object)

    if (classes.length && !this.#shapesPointer && this.#options.shapes) {
      this.#shapesPointer = grapoi({ dataset: this.#shapesStore, factory })
        .hasOut(rdf('type'), sh('NodeShape'))
        .hasOut(sh('targetClass'), classes)
    }

    // const dataPointer = grapoi({ dataset, factory, term: this.#options.subject })
    return { query, dataset }
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

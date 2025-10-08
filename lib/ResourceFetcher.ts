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
import parsePath, { type PathSegment } from './helpers/parsePath'
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
    if (this.#shapesPointer) {
      const properties = this.#shapesPointer ? allShapeProperties(this.#shapesPointer).hasOut(sh('path')) : []
      const shapeBranches: Branch[] = properties.map((propertyPointer: Grapoi) => ({
        pathSegment: parsePath(propertyPointer.out(sh('path'))),
        propertyPointer,
        depth: 1,
        children: [],
        parent: null,
        type: 'shape'
      }))
      for (const branch of shapeBranches) {
        this.#addBranch(branch)
      }
    }

    const getCurrentDepth = () => this.#branches.reduce((max, branch) => (branch.depth > max ? branch.depth : max), 0)

    let processedDepth = 1
    while (processedDepth <= getCurrentDepth()) {
      const nextDepth = processedDepth + 1
      yield await this.executeStep(nextDepth)
      processedDepth = nextDepth
    }
  }

  #addBranch(branch: Branch) {
    this.#branches.push(branch)
  }

  async executeStep(depth: number) {
    // console.log(`Executing step for depth ${depth}`)
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
        dataPointer,
        this.#shapesPointer
      )
      // If the shape pointer previously has been set create shape branches.
      if (this.#shapesPointer) {
        const shapeBranches = createShapeBranches(this.#shapesPointer)
        for (const branch of shapeBranches) {
          this.#addBranch(branch)
        }
      }

      this.#processBranches(depth, dataPointer)
    } else {
      // Add new leaf branches for quads just received.
      const unprocessedLeafBranches = this.#branches.filter(branch => branch.depth === depth - 1 && !branch.processed)
      for (const leafBranch of unprocessedLeafBranches) {
        this.#addDataBranches(leafBranch, dataPointer, this.#shapesPointer)
      }

      this.#processBranches(depth - 1, dataPointer)
    }

    const branches = JSON.parse(
      JSON.stringify(this.#branches, (key, value) => {
        if (key === 'parent') return undefined
        if (key === 'propertyPointer') return undefined
        if (key === 'children' && value.length === 0) return undefined
        if (key === 'quads') {
          return value?.map((quad: OurQuad) => [quad.subject.value, quad.predicate.value, quad.object.value])
        }
        if (key === 'pathSegment') {
          return (value as PathSegment).map(segment => segment.predicates.map(p => p.value).join(' | ')).join(' / ')
        }
        return value
      })
    )

    for (const branch of this.#branches) {
      if (branch.quads) {
        for (const quad of branch.quads) {
          results.add(quad)
        }
      }
    }

    return { query, dataset: results, branches }
  }

  #processBranches(depth: number, dataPointer: Grapoi) {
    // Process branches at current depth.
    const currentBranches = this.#branches.filter(branch => branch.depth === depth).filter(branch => !branch.processed)
    for (const branch of currentBranches) {
      const branchDataPointer = this.#getDataPointerOfBranch(branch, dataPointer)
      const branchQuads = [...branchDataPointer.quads()] as OurQuad[]

      if (branchQuads.length === 0) {
        branch.processed = true
        console.log(branchQuads[0]?.predicate?.value, 'processed')
        continue
      } else if (branchQuads.every(quad => quad.object.termType === 'Literal')) {
        branch.processed = true
        branch.quads = branchQuads
        console.log(branchQuads[0]?.predicate?.value, 'processed')
      }

      // Possibly more quads ahead
      else if (branchQuads.some(quad => quad.object.termType === 'BlankNode' || quad.object.termType === 'NamedNode')) {
        // TODO
        console.log(branchQuads[0].predicate.value, 'skipped')
      } else {
        console.log(branchQuads[0].predicate.value, 'skipped')
      }
    }
  }

  #getDataPointerOfBranch(branch: Branch, dataPointer: Grapoi): Grapoi {
    const parentsPathSegments = []
    let currentParent: Branch | null = branch
    while (currentParent) {
      parentsPathSegments.unshift(...currentParent.pathSegment)
      currentParent = currentParent.parent
    }

    const cappedPathSegments = parentsPathSegments.slice(0, branch.depth)
    return dataPointer.executeAll(cappedPathSegments)
  }

  #addDataBranches(parent: Branch, dataPointer: Grapoi, propertyPointer?: Grapoi) {
    const branchDataPointer = this.#getDataPointerOfBranch(parent, dataPointer)
    const leafQuads = [...branchDataPointer.distinct().out().quads()] as OurQuad[]

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

    for (const branch of quadBranches) {
      this.#addBranch(branch)
    }
  }

  // #addShapeBranches () {
  // const properties = propertyPointer
  //   ? allShapeProperties(propertyPointer)
  //     .hasOut(sh('path'))
  //   : []

  // return properties
  //   .map((propertyPointer: Grapoi) => ({
  //     pathSegment: parsePath(propertyPointer.out(sh('path'))),
  //     propertyPointer,
  //     parent: parent ?? null,
  //     depth: 0,
  //     children: [],
  //     type: 'shape',
  //   } satisfies Branch))

  // }

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
  branches: object
}

// For local development so that tests always run after changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}

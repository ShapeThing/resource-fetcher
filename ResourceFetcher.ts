import type { QueryEngine } from 'npm:@comunica/query-sparql'
import type { QuerySourceUnidentified } from 'npm:@comunica/types'
import factory from 'npm:@rdfjs/data-model'
import datasetFactory from 'npm:@rdfjs/dataset'
import TermSet from 'npm:@rdfjs/term-set'
import type { DatasetCore, Quad, Quad_Object, Quad_Predicate, Quad_Subject } from 'npm:@rdfjs/types'
import grapoi from 'npm:grapoi'
import type Grapoi from './Grapoi.ts'
import { allShapeProperties } from './helpers/allShapeProperties.ts'
import { context, queryPrefixes, sh } from './helpers/namespaces.ts'
import parsePath, { PathSegment } from './helpers/parsePath.ts'
import { toMermaid } from './helpers/toMermaid.ts'

type Options = {
  subject: Quad_Subject
  engine: QueryEngine
  sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]]
  shapesPointer?: Grapoi
  debug?: true
}

export class ResourceFetcher {
  public subject: Quad_Subject
  #engine: QueryEngine
  #branches: Branch[] = []
  #sources: [QuerySourceUnidentified, ...QuerySourceUnidentified[]]
  #shapesPointer?: Grapoi
  #store: DatasetCore = datasetFactory.dataset()
  #pointer: Grapoi
  #latestQuery: string = ''

  constructor(options: Options) {
    this.subject = options.subject
    this.#engine = options.engine
    this.#sources = options.sources
    this.#shapesPointer = options.shapesPointer
    this.#pointer = grapoi({
      dataset: this.#store,
      factory,
      term: this.subject,
    })
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
  async *execute() {
    await this.#initialFetch()

    yield {
      mermaid: this.toMermaid(),
      query: this.#latestQuery,
    }
  }

  /**
   * Execute a query and parses the bindings to Quads.
   * By using a select query we can potentially add to the Quads if it is a leaf or not.
   *
   * The convention of the variable is that anything_[number]
   */
  async executeQuery(query: string) {
    const response = await this.#engine.queryBindings(
      `${queryPrefixes}\n${query}`,
      this.#engineOptions,
    )
    this.#latestQuery = query
    const bindings = await response.toArray()

    const quads: Quad[] = []

    const keys: Set<string> = new Set()
    for (const binding of bindings) {
      const bindingKeys = [...binding.keys()].map((variable) => variable.value)
      for (const bindingKey of bindingKeys) keys.add(bindingKey)
    }

    const highestNode = Math.max(
      ...[...keys]
        .filter((key) => key.includes('_'))
        .map((key) => parseInt(key.split('_').pop()!)),
    )

    for (const binding of bindings) {
      for (let depth = 0; depth <= highestNode; depth++) {
        const subjectVariable = `node_${depth}`
        const predicateVariable = `predicate_${depth}`
        const objectVariable = `node_${depth + 1}`
        const subject = binding.get(subjectVariable)
        const predicate = binding.get(predicateVariable)
        const object = binding.get(objectVariable)
        if (subject && predicate && object) {
          const quad = factory.quad(
            subject as Quad_Subject,
            predicate as Quad_Predicate,
            object as Quad_Object,
          )
          quads.push(quad)
        }
      }
    }

    return quads
  }

  #generateQuery(depth: number) {
    // Helper: cartesian product
    function cartesian(arrays: Quad_Predicate[][]): Quad_Predicate[][] {
      return arrays.reduce((acc: Quad_Predicate[][], curr: Quad_Predicate[]) => {
        const res: Quad_Predicate[][] = []
        acc.forEach((a) => {
          curr.forEach((b) => {
            res.push([...a, b])
          })
        })
        return res
      }, [[]])
    }

    const patternsAndValues: Map<string, Quad_Predicate[]> = new Map()

    return this.#branches.map((branch) => {
      // Get array of arrays of predicates for each segment
      const predicateArrays = branch.pathSegment.map((segment) => segment.predicates)
      // Get all possible trails (cartesian product)
      const trails = cartesian(predicateArrays)

      return trails.map((trail) => {
        // Build query trail string using start/end from each segment
        const queryParts: string[] = []
        for (let i = 0; i < trail.length; i++) {
          const segment = branch.pathSegment[i]
          // Use start/end to determine triple direction
          let subjectVar = `?node_${i}`
          let objectVar = `?node_${i + 1}`
          if (segment.start === 'object' && segment.end === 'subject') {
            // Reverse direction
            ;[subjectVar, objectVar] = [objectVar, subjectVar]
          }
          queryParts.push(`${subjectVar} ?predicate_${queryParts.length} ${objectVar}`)
        }

        patternsAndValues.set(queryParts.join(' . '), trail)

        return `(${queryParts.join(' . ')})`
      }).join('\nUNION\n')
    }).join('\nUNION\n')
  }

  #getShapeBranches() {
    return this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer)
        .hasOut(sh('path'))
        .map((propertyPointer: Grapoi) =>
          new Branch({
            pathSegment: parsePath(propertyPointer.out(sh('path'))),
            propertyPointer,
            dataPointer: grapoi({ dataset: datasetFactory.dataset(), factory, term: this.subject }),
          })
        )
      : []
  }

  /**
   * The initial fetch potentially over fetches the rdf:type of the next layer.
   */
  async #initialFetch() {
    const shapePredicates = this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer).out(sh('path'))
        .terms.filter((term) => term.termType === 'NamedNode')
      : []

    const shapeBranches = this.#getShapeBranches()
    this.#branches.push(...shapeBranches)

    console.log(this.#generateQuery(1))

    const initialQuery = `
		select * WHERE {
			GRAPH ?g {
				VALUES (?node_0 ?predicate_1) { (<${this.subject.value}> rdf:type) }
				?node_0 ?predicate_0 ?node_1 .
				OPTIONAL {
					?node_1 ?predicate_1 ?node_2 .
				}
			}
		}`
    const quads = await this.executeQuery(initialQuery)

    const filteredQuads = quads.filter((quad) => !shapePredicates.some((predicate) => quad.predicate.equals(predicate)))

    const uniquePredicates = new TermSet(filteredQuads.map((quad) => quad.predicate))
    const quadBranches = [...uniquePredicates.values()].map((predicate) =>
      new Branch({
        pathSegment: [
          {
            predicates: [predicate],
            start: 'subject' as const,
            end: 'object' as const,
            quantifier: 'one' as const,
          },
        ],
        dataPointer: grapoi({ dataset: datasetFactory.dataset(quads.filter((quad) => quad.predicate.equals(predicate))), factory, term: this.subject }),
      })
    )

    const temporaryPointer: Grapoi = grapoi({
      dataset: datasetFactory.dataset(quads),
      term: this.subject,
      factory,
    })

    this.#branches.push(...quadBranches)

    for (const branch of this.#branches) {
      this.#processBranch(branch, temporaryPointer)
    }
  }

  #processBranch(branch: Branch, temporaryPointer: Grapoi) {
    const branchPointer = temporaryPointer.executeAll(branch.pathSegment)
    const branchLeafTerms = branchPointer.terms

    const termTypes = new Set(branchLeafTerms.map((term) => term.termType))
    if (termTypes.size > 1) {
      throw new Error('Multiple term types are not supported yet.')
    }

    const emptyBranch = !branchLeafTerms.length
    const allLiterals = termTypes.has('Literal') && termTypes.size === 1
    const allBlankNodes = termTypes.has('BlankNode') && termTypes.size === 1
    const allNamedNodes = termTypes.has('NamedNode') && termTypes.size === 1

    const saveQuadsAndProcessBranch = () => {
      const quads = [...branchPointer.quads()]
      for (const quad of quads) this.#store.add(quad)
      branch.processed = true
    }

    // Close a branch if there are no results.
    // For now we process property paths in their full length,
    // No leaf terms means empty for now.
    if (emptyBranch) {
      branch.processed = true
      return
    } // Close a branch if all results are Literals.
    else if (allLiterals) {
      return saveQuadsAndProcessBranch()
    }

    // For NamedNodes and Blank Nodes we need to determine if there are shapes that require further fetching.
    // The fact that this property has a shape means we should fetch further.
    // In this moment we will expand the shape.
    if (branch.propertyPointer) {
      const nestedProperties = allShapeProperties(branch.propertyPointer)
        .hasOut(sh('path'))
        .map((propertyPointer: Grapoi) => {
          const pathSegment = parsePath(propertyPointer.out(sh('path')))
          return new Branch({
            pathSegment,
            propertyPointer,
            depth: branch.depth + 1,
            dataPointer: branch.dataPointer.executeAll(pathSegment),
          })
        })

      branch.children.push(...nestedProperties)
    } else if (allNamedNodes) {
      return saveQuadsAndProcessBranch()
    }

    if (allBlankNodes) {
      // const quadBranches = [...uniquePredicates.values()].map((predicate) => ({
      //   pathSegment: [
      //     {
      //       predicates: [predicate],
      //       start: "subject" as const,
      //       end: "object" as const,
      //       quantifier: "one" as const,
      //     },
      //   ],
      //   children: [],
      //   depth: 0,
      // }));
    }

    // If the leaf terms contains any BlankNodes do not save any results
    // (for now also literals that do not conform to the property path)
    // We do not need to add a new branch, the initial fetch only gets one layer deep.
    // The next fetch will execute this path again plus one additional layer.
  }

  toMermaid() {
    return toMermaid(this.subject, this.#branches, context)
  }
}

export class Branch {
  pathSegment: PathSegment
  propertyPointer?: Grapoi
  dataPointer: Grapoi
  children: Branch[]
  depth: number
  processed: boolean

  constructor(
    {
      pathSegment,
      propertyPointer,
      dataPointer,
      children,
      depth,
      processed,
    }: {
      pathSegment: PathSegment
      propertyPointer?: Grapoi
      dataPointer: Grapoi
      children?: Branch[]
      depth?: number
      processed?: boolean
    },
  ) {
    this.pathSegment = pathSegment
    this.propertyPointer = propertyPointer
    this.dataPointer = dataPointer
    this.children = children ?? []
    this.depth = depth ?? 0
    this.processed = processed ?? false
  }
}

import type { QueryEngine } from 'npm:@comunica/query-sparql'
import type { QuerySourceUnidentified } from 'npm:@comunica/types'
import factory from 'npm:@rdfjs/data-model'
import datasetFactory from 'npm:@rdfjs/dataset'
import TermSet from 'npm:@rdfjs/term-set'
import type { DatasetCore, Quad, Quad_Object, Quad_Predicate, Quad_Subject } from 'npm:@rdfjs/types'
import grapoi from 'npm:grapoi'
import { Generator, Parser } from 'npm:sparqljs'
import type Grapoi from './Grapoi.ts'
import { allShapeProperties } from './helpers/allShapeProperties.ts'
import { cartesian } from './helpers/cartesian.ts'
import { context, prefixes, queryPrefixes, sh } from './helpers/namespaces.ts'
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
  #stepStore: DatasetCore = datasetFactory.dataset()
  #latestQuery: string = ''
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
  async *execute() {
    const shapeBranches = this.#getShapeBranches()
    this.#branches.push(...shapeBranches)
    yield {
      mermaid: this.toMermaid(),
      query: '',
    }

    await this.#executeStep(1)
    yield {
      mermaid: this.toMermaid(),
      query: this.#latestQuery,
    }

    await this.#executeStep(2)
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
        // Default direction
        const subject = binding.get(`node_${depth}`)
        const predicate = binding.get(`predicate_${depth}`)
        const object = binding.get(`node_${depth + 1}`)
        if (subject && predicate && object) {
          const quad = factory.quad(
            subject as Quad_Subject,
            predicate as Quad_Predicate,
            object as Quad_Object,
          )
          quads.push(quad)
        }

        // Reverse direction
        const reverseSubject = binding.get(`node_${depth}`)
        const reversePredicate = binding.get(`predicate_${depth}`)
        const reverseObject = binding.get(`reverse_node_${depth + 1}`)
        if (reverseSubject && reversePredicate && reverseObject) {
          const quad = factory.quad(
            reverseObject as Quad_Subject,
            reversePredicate as Quad_Predicate,
            reverseSubject as Quad_Object,
          )
          quads.push(quad)
        }
      }
    }

    return quads
  }

  #generateQuery(depth: number) {
    const patternsAndValues: Map<string, Quad_Predicate[][]> = new Map()

    for (const branch of this.#branches) {
      // Get array of arrays of predicates for each segment
      const predicateArrays = branch.pathSegment.map((segment) => segment.predicates)
      // Get all possible trails (cartesian product)
      const trails = cartesian(predicateArrays)

      for (const trail of trails) {
        // Build query trail string using start/end from each segment
        const queryParts: string[] = []
        for (let i = 0; i < Math.min(trail.length, depth); i++) {
          const segment = branch.pathSegment[i]
          // Use start/end to determine triple direction
          let subjectVar = `node_${i}`
          let objectVar = `node_${i + 1}`
          if (segment.start === 'object' && segment.end === 'subject') {
            // Reverse direction
            ;[subjectVar, objectVar] = ['reverse_' + objectVar, subjectVar]
          }
          queryParts.push(`?${subjectVar} ?predicate_${queryParts.length} ?${objectVar}`)
        }

        const patternValues = patternsAndValues.get(queryParts.join(' . ')) || []
        patternsAndValues.set(queryParts.join(' . '), [...patternValues, trail.slice(0, depth)])
      }
    }

    const query = `SELECT * WHERE {
      GRAPH ?g {
        ${
      [...patternsAndValues.entries()].map(([pattern, predicateSets]) => {
        const variables = pattern.split(' ').filter((part) => part.includes('?predicate'))

        const valueSets = predicateSets.map((predicateSet) => `(<${this.subject.value}> ${predicateSet.map((predicate) => `<${predicate.value}>`).join(' ')})`)
        const deduplicatedValueSets = [...new Set(valueSets)]

        // For the initial query we do a ?s ?p ?o
        const initialClause = pattern === '?node_0 ?predicate_0 ?node_1'

        return `{ 
          ${initialClause ? `VALUES (?node_0) {(<${this.subject.value}>)}` : `VALUES (?node_0 ${variables.join(' ')}) { ${deduplicatedValueSets.join('\n')} }`}
          ${pattern}
        }`
      }).join('\n UNION \n')
    }
      }
    }`

    if (this.#debug) {
      const parser = new Parser()
      const parsedQuery = parser.parse(query)
      const generator = new Generator({ prefixes })
      return generator.stringify(parsedQuery)
    } else {
      return query
    }
  }

  #getShapeBranches() {
    return this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer)
        .hasOut(sh('path'))
        .map((propertyPointer: Grapoi) =>
          new Branch({
            pathSegment: parsePath(propertyPointer.out(sh('path'))),
            propertyPointer,
            dataPointer: grapoi({ dataset: this.#stepStore, factory, term: this.subject }),
          })
        )
      : []
  }

  /**
   * One step, needs still some big changes so it works at every level.
   * Currently it will re add nested properties.
   */
  async #executeStep(step: number = 1) {
    const shapePredicates = this.#shapesPointer
      ? allShapeProperties(this.#shapesPointer).out(sh('path'))
        .terms.filter((term) => term.termType === 'NamedNode')
      : []

    const quads = await this.executeQuery(this.#generateQuery(step))
    for (const quad of quads) this.#stepStore.add(quad)

    // TODO this last part gets more complex in deeper depths.
    const filteredQuads = quads.filter((quad) => !shapePredicates.some((predicate) => quad.predicate.equals(predicate)) && quad.subject.equals(this.subject))
    const uniquePredicates = new TermSet(filteredQuads.map((quad) => quad.predicate))

    const quadBranches = [...uniquePredicates.values()].map((predicate) => {
      const pathSegment = [
        {
          predicates: [predicate],
          start: 'subject' as const,
          end: 'object' as const,
          quantifier: 'one' as const,
        },
      ]

      return new Branch({
        pathSegment,
        dataPointer: grapoi({ dataset: this.#stepStore, factory, term: this.subject }),
      })
    })

    this.#branches.push(...quadBranches)

    for (const branch of this.#branches) {
      this.#processBranch(branch)
    }
  }

  #processBranch(branch: Branch) {
    const resolvedBranchPointer = branch.dataPointer.executeAll(branch.pathSegment)
    const branchLeafTerms = resolvedBranchPointer.terms

    const emptyBranch = !branchLeafTerms.length

    const saveQuadsAndProcessBranch = () => {
      const quads = [...resolvedBranchPointer.quads()]
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

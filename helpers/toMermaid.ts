import { Quad_Subject } from 'npm:@rdfjs/types'
import { Branch } from '../core/Branch.ts'
import Grapoi from './Grapoi.ts'
import { context } from './namespaces.ts'
import { PathSegment } from './parsePath.ts'

export const toMermaid = (subject: Quad_Subject, branches: Branch[], dataPointer?: Grapoi) => {
  let chart = `---\nconfig:\n  layout: dagre\n---\nflowchart LR\n\n`

  a = 0

  // Collect all branch outputs with their path information
  const branchOutputs: Array<{ output: string; pathSegment: PathSegment; branch: Branch }> = []

  const collectBranchOutputs = (branch: Branch, subjectId: string = subject.value, objectId?: string) => {
    const result = branchToMermaidWithPath(branch, subjectId, objectId, dataPointer)
    branchOutputs.push({ output: result.output, pathSegment: branch.pathSegment, branch })

    // Recursively collect child outputs
    for (const child of branch.children) {
      collectBranchOutputs(child, result.lastObjectId, undefined)
    }
  }

  // Collect all outputs
  for (const branch of branches) {
    collectBranchOutputs(branch)
  }

  // Deduplicate paths - keep only the longest paths
  const filteredOutputs = deduplicatePaths(branchOutputs)

  chart += filteredOutputs.map((item: { output: string; pathSegment: PathSegment; branch: Branch }) => item.output).join('')

  chart += `classDef data stroke-dasharray: 5 5,stroke:green;\n`
  chart += `classDef done fill:#97dc97,stroke-width:4px;\n`
  chart += `classDef hasData fill:green,color:white,stroke-width:4px;\n`

  return chart
}

export let a = 0

// Helper function to check if one path is a subset of another
const isPathSubset = (shorter: PathSegment, longer: PathSegment): boolean => {
  if (shorter.length >= longer.length) return false

  // Check if the shorter path is a prefix of the longer path
  for (let i = 0; i < shorter.length; i++) {
    const shorterPart = shorter[i]
    const longerPart = longer[i]

    // Compare predicates
    if (shorterPart.predicates.length !== longerPart.predicates.length) return false
    for (let j = 0; j < shorterPart.predicates.length; j++) {
      if (shorterPart.predicates[j].value !== longerPart.predicates[j].value) return false
    }

    // Compare start direction
    if (shorterPart.start !== longerPart.start) return false
  }

  return true
}

// Function to deduplicate paths, keeping only the longest ones
const deduplicatePaths = (branchOutputs: Array<{ output: string; pathSegment: PathSegment; branch: Branch }>) => {
  const filtered: Array<{ output: string; pathSegment: PathSegment; branch: Branch }> = []

  for (const candidate of branchOutputs) {
    let isSubset = false

    // Check if this candidate is a subset of any existing path
    for (const existing of branchOutputs) {
      if (candidate !== existing && isPathSubset(candidate.pathSegment, existing.pathSegment)) {
        isSubset = true
        break
      }
    }

    if (!isSubset) {
      filtered.push(candidate)
    }
  }

  return filtered
}

// Modified branchToMermaid that returns both output and last object ID
const branchToMermaidWithPath = (
  branch: Branch,
  subject: string = 'a' + a++,
  object: string = 'a' + a++,
  dataPointer?: Grapoi,
): { output: string; lastObjectId: string } => {
  let output = ''
  const pathSegment = branch.pathSegment

  const partIdentifiers = new Map<number, string>()
  partIdentifiers.set(0, subject)
  partIdentifiers.set(pathSegment.length, object)
  for (let i = 1; i < pathSegment.length; i++) {
    partIdentifiers.set(i, 'a' + a++)
  }

  const predicateIds = new Set<string>()

  let hasData = false

  for (const [i, part] of pathSegment.entries()) {
    const partSubject = partIdentifiers.get(i)!
    const partObject = partIdentifiers.get(i + 1)!

    const quads = dataPointer ? [...dataPointer.executeAll(pathSegment.slice(0, i + 1)).quads()] : []

    if (quads.length) hasData = true

    for (const predicate of part.predicates) {
      const predicateId = 'a' + a++
      predicateIds.add(predicateId)
      const compactedIri = context.compactIri(predicate.value)
      const label = compactedIri
        .replace(/http:/g, 'http:‎')
        .replace(/https:/g, 'https:‎')
        .replace(/www/g, 'www‎')

      const triple = [
        partSubject,
        '-->',
        `${predicateId}("${label}")`,
        '-->',
        `${partObject}("${quads.length}")`,
      ]

      // Reverse the triple if the path starts with "object"
      if (part.start === 'object') triple.reverse()

      output += triple.join(' ') + '\n'
    }
  }

  output += `class ${
    [
      ...partIdentifiers.values(),
      ...predicateIds.values(),
    ].join(',')
  } ${branch.type};\n`

  if (hasData) {
    output += `class ${
      [
        ...partIdentifiers.values(),
        ...predicateIds.values(),
      ].join(',')
    } hasData;\n`
  } else if (branch.processed) {
    output += `class ${
      [
        ...partIdentifiers.values(),
        ...predicateIds.values(),
      ].join(',')
    } done;\n`
  }

  return { output, lastObjectId: partIdentifiers.get(pathSegment.length)! }
}

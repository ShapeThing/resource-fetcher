import type { Quad_Predicate } from '@rdfjs/types'
import { cartesian } from '../helpers/cartesian.ts'
import type { Branch } from '../core/Branch.ts'

// Helper function to build trail from root to a specific branch
export const buildTrailToBranch = (branch: Branch): Quad_Predicate[][] => {
  const pathSegments: typeof branch.pathSegment = []
  let currentBranch: Branch | null = branch
  while (currentBranch) {
    pathSegments.unshift(...currentBranch.pathSegment)
    currentBranch = currentBranch.parent
  }
  const predicateArrays = pathSegments.map(segment => segment.predicates)
  return cartesian(predicateArrays)
}
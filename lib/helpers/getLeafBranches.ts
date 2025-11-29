import type { Branch } from '../core/Branch.ts'

/**
 * Get all leaf branches (branches that have no children)
 * TODO change to use Branch.depth
 */
export const getLeafBranches = (branches: Branch[]): Branch[] => {
  const leafBranches: Branch[] = []

  const collectLeafBranches = (branch: Branch) => {
    if (!branch.processed) {
      leafBranches.push(branch)
    }
    for (const child of branch.children) {
      collectLeafBranches(child)
    }
  }
  // Start from root branch children
  for (const child of branches) {
    collectLeafBranches(child)
  }
  return leafBranches
}

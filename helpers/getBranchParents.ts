import { Branch } from '../core/Branch.ts'

export const getBranchParents = (branch: Branch) => {
  const parents = []
  let current: Branch = branch
  while (current) {
    parents.push(current)
    if (current.parent === null) break
    current = current.parent
  }
  return parents.reverse()
}

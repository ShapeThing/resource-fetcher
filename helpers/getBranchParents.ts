import { Branch } from '../core/Branch.ts'

export const getBranchParents = (branch: Branch) => {
  const parents = []
  let current: Branch = branch
  while (current) {
    parents.push(current)
    current = current.parent
  }
  return parents.reverse()
}

import { allShapeProperties } from '../helpers/allShapeProperties.ts'
import type { Grapoi } from '../helpers/Grapoi.ts'
import { sh } from '../helpers/namespaces.ts'
import parsePath from '../helpers/parsePath.ts'
import type { Branch } from './Branch.ts'

export const addShapeBranches = (branch: Branch) => {
  if (branch.addedShapeBranches) return
  branch.addedShapeBranches = true
  const shapeBranches = branch.propertyPointer ? createShapeBranches(branch.propertyPointer, branch) : []
  branch.children.push(...shapeBranches)
}

export const createShapeBranches = (propertyPointer: Grapoi, parent?: Branch) => {
  const properties = propertyPointer
    ? allShapeProperties(propertyPointer)
      .hasOut(sh('path'))
    : []

  return properties
    .map((propertyPointer: Grapoi) => ({
      pathSegment: parsePath(propertyPointer.out(sh('path'))),
      propertyPointer,
      parent: parent ?? null,
      depth: 0,
      children: [],
      type: 'shape',
    } satisfies Branch))
}

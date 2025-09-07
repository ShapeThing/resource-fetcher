import { allShapeProperties } from '../helpers/allShapeProperties.ts'
import Grapoi from '../helpers/Grapoi.ts'
import { sh } from '../helpers/namespaces.ts'
import parsePath from '../helpers/parsePath.ts'
import { ResourceFetcher } from '../ResourceFetcher.ts'
import { Branch } from './Branch.ts'

export const addShapeBranches = (branch: Branch) => {
  if (branch.addedShapeBranches) return
  branch.addedShapeBranches = true
  const shapeBranches = createShapeBranches(branch.propertyPointer, branch.resourceFetcher, branch)
  branch.children.push(...shapeBranches)
}

export const createShapeBranches = (propertyPointer: Grapoi, resourceFetcher: ResourceFetcher, parent?: Branch) => {
  const properties = propertyPointer
    ? allShapeProperties(propertyPointer)
      .hasOut(sh('path'))
    : []

  return properties
    .map((propertyPointer: Grapoi) => ({
      pathSegment: parsePath(propertyPointer.out(sh('path'))),
      propertyPointer,
      parent: parent ?? resourceFetcher,
      depth: 0,
      children: [],
      type: 'shape',
      resourceFetcher,
    } satisfies Branch))
}

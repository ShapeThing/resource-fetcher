import Grapoi from '../helpers/Grapoi.ts'
import type { PathSegment } from '../helpers/parsePath.ts'

export type Branch = {
  pathSegment: PathSegment
  children: Branch[]
  depth: number
  type: 'shape' | 'data'
  parent: Branch | null
  processed?: boolean
  propertyPointer?: Grapoi
  addedShapeBranches?: boolean
  addedDataBranches?: boolean
}

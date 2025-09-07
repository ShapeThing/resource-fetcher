import Grapoi from '../helpers/Grapoi.ts'
import { PathSegment } from '../helpers/parsePath.ts'
import { ResourceFetcher } from '../ResourceFetcher.ts'

export type Branch = {
  pathSegment: PathSegment
  children: Branch[]
  depth: number
  resourceFetcher: ResourceFetcher
  type: 'shape' | 'data'
  parent: Branch | ResourceFetcher
  processed?: boolean
  propertyPointer: Grapoi
  addedShapeBranches?: boolean
  addedDataBranches?: boolean
}

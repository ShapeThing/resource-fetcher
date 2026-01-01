import type { Grapoi } from './Grapoi.ts'
import { sh } from './namespaces.ts'

export const allShapeSubShapes = (shapesPointer: Grapoi) => {
  const originalNodes = shapesPointer.terms

  const logicalPointers = shapesPointer
    .out([sh('xone'), sh('and'), sh('or')])
    .map((pointer: Grapoi) => (pointer.isList() ? Array.from(pointer.list() ?? []) : []))
    .flat()
    .flatMap(pointer => pointer.terms)

  const nestedPointers = shapesPointer.out(sh('node')).terms
  const shapeTerms = shapesPointer.node([...logicalPointers]).out().terms
  return shapesPointer.node([...shapeTerms, ...nestedPointers, ...originalNodes])
}

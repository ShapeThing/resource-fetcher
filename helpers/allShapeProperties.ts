import Grapoi from "../Grapoi.ts";
import { sh } from "./namespaces.ts";

export const allShapeProperties = (shapesPointer: Grapoi) => {
  const originalNodes = shapesPointer.terms;

  const logicalPointers = shapesPointer
    .out([sh("xone"), sh("and"), sh("or")])
    /** @ts-ignore */
    .map((pointer: Grapoi) => (pointer.isList() ? [...pointer.list()] : []))
    .flat()
    .flatMap((pointer) => pointer.terms);

  const nestedPointers = shapesPointer.out(sh("node")).terms;

  const shapeTerms = shapesPointer
    .node([...originalNodes, ...logicalPointers, ...nestedPointers])
    .out().terms;

  return shapesPointer.node(shapeTerms).hasOut(sh("path"));
};

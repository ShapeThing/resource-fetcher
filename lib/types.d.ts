declare module 'grapoi' {
  export default function grapoi(options: {
    dataset: DatasetCore
    factory: Environment<unknown>
    ptrs?: PathList[]
    term?: Term
    terms?: Term[]
    graphs?: Term[]
  }): Grapoi
}

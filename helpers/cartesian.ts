// Helper: cartesian product
export function cartesian<T>(arrays: T[][]): T[][] {
  return arrays.reduce((acc: T[][], curr: T[]) => {
    const res: T[][] = []
    acc.forEach((a) => {
      curr.forEach((b) => {
        res.push([...a, b])
      })
    })
    return res
  }, [[]])
}

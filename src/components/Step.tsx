import type { Run } from '../App'

type Props = {
  step: Run['steps'][number]
  depth: number
}

export default function Step({ step, depth }: Props) {
  return (
    <div className="step">
      <details open>
        <summary>Query</summary>
        <pre className="query">{step.query}</pre>
      </details>
      <details open>
        <summary>Results</summary>
        <pre className="results">{step.turtle}</pre>
      </details>
      <details>
        <summary>Branches</summary>
        <div className="branches">
          {step.branches.map(branch => {
            if (branch.processed < depth) return null
            return (
              <div key={JSON.stringify(branch)} className={`branch depth-${branch.depth} ${branch.processed < depth ? 'processed-previously' : ''}`}>
                <span className="processed">{branch.processed ? '✅' : '⏳'}{branch.processed}</span>
                <span className="path-segment">{branch.pathSegment}</span>
                <em>{branch.depth}</em>
                {branch.quads ? (
                  <div className="branch-quads">
                    {branch.quads?.map(quad => (
                      <div className="quad" key={JSON.stringify(quad)}>
                        {quad.map(term => (
                          <span key={term} className="term">{term}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </details>
    </div>
  )
}

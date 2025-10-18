import type { DebugBranch } from '../../lib/ResourceFetcher'
import type { Run } from '../App'

type Props = {
  step: Run['steps'][number]
  depth: number
}

const trimPrefixes = (turtle: string) => {
  return turtle
    .split('\n')
    .map(line => line.startsWith('@prefix') ? '' : line)
    .filter(line => line.trim() !== '')
    .join('\n')
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
        <pre className="results">{trimPrefixes(step.turtle)}</pre>
      </details>
      <details open>
        <summary>Branches</summary>
        <div className="branches">
          {step.branches.map(branch => (
            <Branch key={JSON.stringify(branch)} {...branch} depth={depth} />
          ))}
        </div>
      </details>
    </div>
  )
}

function Branch(branch: DebugBranch & { depth: number }) {
  return (
    <div key={JSON.stringify(branch)} className={`branch depth-${branch.depth} ${branch.processed < branch.depth ? 'previously-processed' : ''} ${branch.children && branch.children.length ? 'has-children' : 'no-children'}`}>
      <span className="processed">
        {branch.processed ? '✅' : '⏳'}
      </span>
      <span className="path-segment">{branch.pathSegment}</span>
      {branch.quads ? (
        <div className="branch-quads">
          {branch.quads?.map(quad => (
            <div className="quad" key={JSON.stringify(quad)}>
              {quad.map(term => (
                <span key={term} className="term">
                  {term}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {branch.children ? <div className="branch-children">{branch.children.map(child => <Branch key={JSON.stringify(child)} {...child} />)}</div> : null}
    </div>
  )
}

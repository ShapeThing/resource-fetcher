import type { DebugBranch } from '../../lib/ResourceFetcher'
import type { Run } from '../App'

type Props = {
  step: Run['steps'][number]
  depth: number
  run: Run
}

const trimPrefixes = (turtle: string) => {
  return turtle
    .split('\n')
    .map(line => (line.startsWith('@prefix') ? '' : line))
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
        <summary>Query result</summary>
        <pre className="results">{trimPrefixes(step.turtle)}</pre>
      </details>
      <details open>
        <summary>Branches</summary>
        <div className="branches">
          {step.branches.map(branch => (
            <Branch key={JSON.stringify(branch)} branch={branch} depth={depth} />
          ))}
        </div>
      </details>
    </div>
  )
}

function Branch({ branch, depth }: { branch: DebugBranch; depth: number }) {
  return (
    <div
      key={JSON.stringify(branch)}
      data-processed={branch.processed}
      className={`branch depth-${depth} ${branch.processed +1  < depth ? 'previously-processed' : ''} ${branch.children && branch.children.length ? 'has-children' : 'no-children'}`}
    >
      <span className="processed">{branch.processed ? '✔️' : '⏳'}</span>
      <span className="path-segment">{branch.pathSegment}</span>&nbsp;
      <em className={`branch-type branch-type-${branch.type}`}>{branch.type}</em>
      {branch.quads ? (
        <div className="branch-quads">
          {branch.quads?.map((quad, index) => (
            <div className="quad" key={JSON.stringify(quad) + index}>
              {quad.map(term => (
                <span key={term} className="term">
                  {term}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {branch.children ? (
        <div className="branch-children">
          {branch.children.map(child => (
            <Branch key={JSON.stringify(child)} branch={child} depth={depth + 1} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

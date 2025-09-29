import type { Options } from '../../lib/ResourceFetcher'

type Props = {
  configuration: Options
  setConfiguration: (config: Options) => void
}

export default function Configuration({ configuration, setConfiguration }: Props) {
  const sourceType = configuration.sources[0]?.type || ''
  const shapeType = configuration.shapes?.[0]?.type || ''

  return (
    <div>
      {/* Subject */}
      <div className="field">
        <label className='label'>Subject</label>
        <div>
          <input
            type="url"
            value={configuration.subject.value}
            onChange={e =>
              setConfiguration({ ...configuration, subject: { ...configuration.subject, value: e.target.value } })
            }
          />
        </div>
      </div>
      {/* Shapes */}
      <div className="field">
        <label className='label'>Shapes <em>(optional)</em></label>
        <div className="radio-item">
          <label>
            <input
              type="radio"
              onChange={() => setConfiguration({ ...configuration, shapes: [] })}
              checked={!shapeType}
              name="shape"
            />
            Not available
          </label>
        </div>
        <div className="radio-item">
          <label>
            <input
              type="radio"
              onChange={() => setConfiguration({ ...configuration, shapes: [{ type: 'sparql', value: '' }] })}
              checked={shapeType === 'sparql'}
              name="shape"
            />
            SPARQL Endpoint
            {shapeType === 'sparql' && (
              <div>
                <input
                  type="url"
                  required
                  value={configuration.shapes?.[0]?.value || ''}
                  onChange={e =>
                    setConfiguration({ ...configuration, shapes: [{ type: 'sparql', value: e.target.value }] })
                  }
                />
              </div>
            )}
          </label>
        </div>
        <div className="radio-item">
          <label>
            <input
              type="radio"
              onChange={() => setConfiguration({ ...configuration, shapes: [{ type: 'file', value: '' }] })}
              checked={shapeType === 'file'}
              name="shape"
            />
            File
            {shapeType === 'file' && (
              <div>
                <input
                  type="file"
                  required
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const fileContents = await file.text()
                      setConfiguration({ ...configuration, shapes: [{ type: 'file', value: fileContents, filename: file.name }] })
                    }
                  }}
                />
                {configuration.shapes?.[0].type === 'file' && configuration.shapes?.[0]?.filename && (
                  <em>{configuration.shapes[0].filename}</em>
                )}
              </div>
            )}
          </label>
        </div>
      </div>
      {/* Sources */}
      <div className="field">
        <label className='label'>Source</label>
        <div className="radio-item">
          <label>
            <input
              type="radio"
              onChange={() => setConfiguration({ ...configuration, sources: [{ type: 'sparql', value: '' }] })}
              checked={sourceType === 'sparql'}
              name="source"
            />
            SPARQL Endpoint
            {sourceType === 'sparql' && (
              <div>
                <input
                  type="url"
                  required
                  value={configuration.sources[0]?.value || ''}
                  onChange={e =>
                    setConfiguration({ ...configuration, sources: [{ type: 'sparql', value: e.target.value }] })
                  }
                />
              </div>
            )}
          </label>
        </div>
        <div className="radio-item">
          <label>
            <input
              type="radio"
              onChange={() => setConfiguration({ ...configuration, sources: [{ type: 'file', value: '' }] })}
              checked={sourceType === 'file'}
              name="source"
            />
            File
            {sourceType === 'file' && (
              <div>
                <input
                  type="file"
                  required
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const fileContents = await file.text()
                      setConfiguration({ ...configuration, sources: [{ type: 'file', value: fileContents, filename: file.name }] })
                    }
                  }}
                />
                {configuration.sources[0].type === 'file' && configuration.sources[0]?.filename && (
                  <em>{configuration.sources[0].filename}</em>
                )}
              </div>
            )}
          </label>
        </div>
      </div>
    </div>
  )
}

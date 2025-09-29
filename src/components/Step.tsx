import type { Run } from "../App"

type Props = {
    step: Run['steps'][number]
}

export default function Step({ step }: Props) {
    return (
        <div>
            <pre>{step.query}</pre>
            <pre>{step.turtle}</pre>
        </div>
    )
}
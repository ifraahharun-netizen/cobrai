/** Claude's brand colour (terracotta). */
export const CLAUDE_ORANGE = "#D97757";

/**
 * The Claude starburst mark, drawn as rays from the centre so it stays crisp
 * at any size. Shown in Claude's own orange; pass `color` to override.
 */
const RAYS: Array<[angle: number, length: number]> = [
    [0, 10], [30, 8.6], [58, 10.4], [90, 9], [118, 10.2], [150, 8.4],
    [180, 10], [208, 9], [238, 10.4], [270, 8.6], [300, 10.2], [330, 9],
];

export default function ClaudeMark({
    size = 16,
    className,
    color = CLAUDE_ORANGE,
}: {
    size?: number;
    className?: string;
    color?: string;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
            className={className}
            aria-hidden="true"
            focusable="false"
        >
            {RAYS.map(([angle, length]) => {
                const rad = (angle * Math.PI) / 180;
                const inner = 2.2;
                return (
                    <line
                        key={angle}
                        x1={12 + Math.cos(rad) * inner}
                        y1={12 + Math.sin(rad) * inner}
                        x2={12 + Math.cos(rad) * length}
                        y2={12 + Math.sin(rad) * length}
                    />
                );
            })}
        </svg>
    );
}

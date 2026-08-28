type RatingMetric = {
  id: string;
  label: string;
  score: number | null;
  answerCount: number;
  inactive?: boolean;
};

const CENTER_X = 210;
const CENTER_Y = 160;
const RADIUS = 116;
const AXIS_COUNT = 6;

function pointAt(axis: number, radius: number) {
  const angle = -Math.PI / 2 + (axis * Math.PI * 2) / AXIS_COUNT;
  return {
    x: CENTER_X + Math.cos(angle) * radius,
    y: CENTER_Y + Math.sin(angle) * radius,
  };
}

function pointsAt(radius: number) {
  return Array.from({ length: AXIS_COUNT }, (_, axis) => {
    const point = pointAt(axis, radius);
    return `${point.x},${point.y}`;
  }).join(" ");
}

function RadarFigure({ metrics }: { metrics: RatingMetric[] }) {
  const plotted = metrics.map((metric, axis) => {
    const score = Math.max(0, Math.min(5, metric.score ?? 0));
    return pointAt(axis, (score / 5) * RADIUS);
  });
  const description = metrics
    .map((metric) => `${metric.label} ${metric.score?.toFixed(1) ?? "점수 없음"}`)
    .join(", ");

  return (
    <div className="rating-radar-block">
      <div className="rating-radar-canvas">
        <svg
          viewBox="0 0 420 330"
          role="img"
          aria-labelledby={`radar-title-${metrics[0]?.id}`}
        >
          <title id={`radar-title-${metrics[0]?.id}`}>학교 질문별 평균 점수</title>
          <desc>{description}. 5점에 가까울수록 바깥쪽에 표시됩니다.</desc>

          {[1, 2, 3, 4, 5].map((level) => (
            <polygon
              key={level}
              points={pointsAt((RADIUS * level) / 5)}
              className={level === 5 ? "radar-grid radar-grid-outer" : "radar-grid"}
            />
          ))}
          {Array.from({ length: AXIS_COUNT }, (_, axis) => {
            const end = pointAt(axis, RADIUS);
            return (
              <line
                key={axis}
                x1={CENTER_X}
                y1={CENTER_Y}
                x2={end.x}
                y2={end.y}
                className="radar-axis"
              />
            );
          })}

          <polygon
            points={plotted.map((point) => `${point.x},${point.y}`).join(" ")}
            className="radar-score-area"
          />
          {plotted.map((point, axis) => (
            <circle
              key={metrics[axis].id}
              cx={point.x}
              cy={point.y}
              r="5"
              className="radar-score-dot"
            />
          ))}
          {metrics.map((metric, axis) => {
            const label = pointAt(axis, RADIUS + 25);
            return (
              <g key={metric.id} className="radar-number">
                <circle cx={label.x} cy={label.y} r="13" />
                <text x={label.x} y={label.y} dy="0.35em" textAnchor="middle">
                  {axis + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ol className="rating-radar-legend">
        {metrics.map((metric, index) => (
          <li key={metric.id}>
            <span className="rating-radar-index" aria-hidden="true">{index + 1}</span>
            <div className="grow">
              <strong>{metric.label}</strong>
              <span className="muted">
                {metric.id === "overall" ? "전체 참여자 기준" : `${metric.answerCount}명 응답`}
                {metric.inactive ? " · 비활성 질문" : ""}
              </span>
            </div>
            <strong className="rating-radar-score">
              {metric.score === null ? "-" : metric.score.toFixed(1)}
            </strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SchoolRatingRadar({
  metrics,
  overallScore,
}: {
  metrics: RatingMetric[];
  overallScore: number | null;
}) {
  const groups: RatingMetric[][] = [];

  for (let index = 0; index < metrics.length; index += AXIS_COUNT) {
    const group = metrics.slice(index, index + AXIS_COUNT);
    if (group.length === 5) {
      group.push({
        id: "overall",
        label: "전체 평균",
        score: overallScore,
        answerCount: 0,
      });
    }
    groups.push(group);
  }

  return (
    <div className="rating-radar-card">
      {groups.map((group, index) => (
        <RadarFigure key={`${group[0].id}-${index}`} metrics={group} />
      ))}
      <p className="muted rating-radar-caption">바깥쪽에 가까울수록 5점에 가까운 평가입니다.</p>
    </div>
  );
}

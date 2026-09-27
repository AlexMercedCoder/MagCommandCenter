export function ExperimentalBadge(props: { title?: string }) {
  return (
    <span
      className="experimental-badge"
      title={
        props.title ??
        "Experimental: not covered by the 1.0 stability promise and may change or be removed."
      }
    >
      Experimental
    </span>
  );
}

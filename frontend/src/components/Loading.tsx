export function Loading({ text = 'Loading...' }: { text?: string }) {
  return <div className="loading">{text}</div>;
}

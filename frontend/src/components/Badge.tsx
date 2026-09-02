export function Badge({ status }: { status: string }) {
  const isActive = status === 'active';
  return <span className={`badge ${isActive ? 'badge-active' : 'badge-inactive'}`}>{status}</span>;
}

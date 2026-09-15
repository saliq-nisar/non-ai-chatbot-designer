export const Spinner = ({ label = "Loading" }: { label?: string }) => (
  <div className="spinner" role="status" aria-label={label} />
);

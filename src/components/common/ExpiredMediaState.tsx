interface ExpiredMediaStateProps {
  title: string;
  message: string;
}

export function ExpiredMediaState({ title, message }: ExpiredMediaStateProps) {
  return (
    <div className="evidence-expired-state">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

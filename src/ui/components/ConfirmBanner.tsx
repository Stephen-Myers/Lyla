export function ConfirmBanner({
  message,
  onAccept,
  onDecline,
}: {
  message: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="confirm-banner" role="alertdialog">
      <div>{message}</div>
      <div className="actions">
        <button className="icon-btn" type="button" onClick={onDecline}>
          Decline
        </button>
        <button className="mode-btn active" type="button" onClick={onAccept}>
          Confirm
        </button>
      </div>
    </div>
  );
}

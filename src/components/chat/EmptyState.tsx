// Ikamba Logo SVG Component
const IkambaLogo = ({ className }: { className?: string }) => (
  <svg className={className} width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M18.3279 33.2066C19.157 32.2118 20.3851 31.6365 21.6802 31.6365H39.2727C44.0927 31.6365 48 27.7292 48 22.9093V18.5456C48 13.7257 44.0927 9.81836 39.2727 9.81836H35.862C34.567 9.81836 33.3388 10.3936 32.5098 11.3885L29.6721 14.7937C28.843 15.7886 27.6149 16.3638 26.3198 16.3638H8.72727C3.90733 16.3638 0 20.2711 0 25.0911V29.4547C0 34.2747 3.90733 38.182 8.72727 38.182H12.138C13.433 38.182 14.6612 37.6068 15.4902 36.612L18.3279 33.2066ZM41.4545 18.5456C41.4545 17.3406 40.4777 16.3638 39.2727 16.3638H32.5893C31.2942 16.3638 30.0661 16.939 29.237 17.9339L26.3993 21.3392C25.5703 22.334 24.3421 22.9093 23.0471 22.9093H8.72727C7.52229 22.9093 6.54545 23.8861 6.54545 25.0911V29.4547C6.54545 30.6596 7.52229 31.6365 8.72727 31.6365H15.4107C16.7058 31.6365 17.9339 31.0612 18.763 30.0664L21.6007 26.6611C22.4297 25.6663 23.6579 25.0911 24.9529 25.0911H39.2727C40.4777 25.0911 41.4545 24.1142 41.4545 22.9093V18.5456Z" fill="currentColor"/>
  </svg>
);

export function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-4 animate-fade-in-up">
        {/* Professional Logo - No background */}
        <IkambaLogo className="h-20 w-20 text-primary mx-auto" />

        {/* Simple text */}
        <p className="text-muted-foreground text-sm">
          How can I help you today?
        </p>
      </div>
    </div>
  );
}

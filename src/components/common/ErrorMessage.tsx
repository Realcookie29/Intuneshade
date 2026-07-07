import { MessageBar, MessageBarBody, MessageBarActions, Button } from "@fluentui/react-components";
import { DismissRegular } from "@fluentui/react-icons";

interface Props {
  message: string;
  onDismiss?: () => void;
}

export default function ErrorMessage({ message, onDismiss }: Props) {
  return (
    <MessageBar intent="error">
      <MessageBarBody>{message}</MessageBarBody>
      {onDismiss && (
        <MessageBarActions
          containerAction={
            <Button
              appearance="transparent"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Dismiss"
            />
          }
        />
      )}
    </MessageBar>
  );
}

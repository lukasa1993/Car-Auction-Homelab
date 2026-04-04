import * as React from "react";

import { Button, type ButtonProps } from "./button";

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

interface CopyTextButtonProps extends Omit<ButtonProps, "onClick"> {
  value: string;
  idleLabel?: string;
  copiedLabel?: string;
  errorLabel?: string;
}

export function CopyTextButton({
  copiedLabel = "Copied",
  errorLabel = "Error",
  idleLabel = "Copy",
  size = "sm",
  type = "button",
  value,
  variant = "outline",
  ...props
}: CopyTextButtonProps) {
  const [label, setLabel] = React.useState(idleLabel);
  const resetTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current) {
        window.clearTimeout(resetTimer.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await copyText(value);
      setLabel(copiedLabel);
    } catch {
      setLabel(errorLabel);
    }

    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
    }

    resetTimer.current = window.setTimeout(() => {
      setLabel(idleLabel);
    }, 1200);
  };

  return (
    <Button
      {...props}
      onClick={handleCopy}
      size={size}
      type={type}
      variant={variant}
    >
      {label}
    </Button>
  );
}

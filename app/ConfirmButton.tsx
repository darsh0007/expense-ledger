"use client";

// A submit button that asks for confirmation before letting the form submit.
//
// Server Components can't attach event handlers, so this tiny Client Component
// wraps the button. It still submits the surrounding <form action={serverAction}>
// normally — it just cancels the submit if the user clicks "Cancel".

import type { ReactNode } from "react";

export function ConfirmButton({
  children,
  message,
  className,
  ariaLabel,
  title,
}: {
  children: ReactNode;
  message: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      aria-label={ariaLabel}
      title={title}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

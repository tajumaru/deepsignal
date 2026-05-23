import { useState, type MouseEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { preloadWalletProviders } from "./walletPreload";

interface CreateFormLinkProps {
  children: ReactNode;
  className?: string;
  nav?: boolean;
  onClick?: () => void;
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.metaKey || event.altKey || event.ctrlKey || event.shiftKey;
}

function createFreshFormTarget() {
  return {
    pathname: "/create",
    search: `?fresh=${Date.now()}`,
  };
}

export function CreateFormLink({ children, className, nav = false, onClick }: CreateFormLinkProps) {
  const navigate = useNavigate();
  const [isPressing, setIsPressing] = useState(false);
  const resolvedClassName = `${className ?? ""} ${isPressing ? "is-pressing" : ""}`.trim();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    preloadWalletProviders();
    if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
      return;
    }
    event.preventDefault();
    setIsPressing(true);
    onClick?.();
    navigate(createFreshFormTarget());
  }

  if (nav) {
    return (
      <NavLink
        className={resolvedClassName}
        to="/create"
        onClick={handleClick}
        onBlur={() => setIsPressing(false)}
        onFocus={preloadWalletProviders}
        onPointerDown={() => setIsPressing(true)}
        onPointerLeave={() => setIsPressing(false)}
        onPointerUp={() => setIsPressing(false)}
        onPointerEnter={preloadWalletProviders}
      >
        {children}
      </NavLink>
    );
  }

  return (
    <Link
      className={resolvedClassName}
      to="/create"
      onClick={handleClick}
      onBlur={() => setIsPressing(false)}
      onFocus={preloadWalletProviders}
      onPointerDown={() => setIsPressing(true)}
      onPointerLeave={() => setIsPressing(false)}
      onPointerUp={() => setIsPressing(false)}
      onPointerEnter={preloadWalletProviders}
    >
      {children}
    </Link>
  );
}

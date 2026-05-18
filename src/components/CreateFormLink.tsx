import type { MouseEvent, ReactNode } from "react";
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

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    preloadWalletProviders();
    if (event.defaultPrevented || event.button !== 0 || isModifiedEvent(event)) {
      return;
    }
    event.preventDefault();
    onClick?.();
    navigate(createFreshFormTarget());
  }

  if (nav) {
    return (
      <NavLink
        className={className}
        to="/create"
        onClick={handleClick}
        onFocus={preloadWalletProviders}
        onPointerEnter={preloadWalletProviders}
      >
        {children}
      </NavLink>
    );
  }

  return (
    <Link
      className={className}
      to="/create"
      onClick={handleClick}
      onFocus={preloadWalletProviders}
      onPointerEnter={preloadWalletProviders}
    >
      {children}
    </Link>
  );
}
